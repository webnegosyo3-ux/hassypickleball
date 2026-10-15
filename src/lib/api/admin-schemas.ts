import { z } from 'zod'

/**
 * Boundary validation for staff-initiated writes.
 *
 * Two fields are deliberately absent from every schema here: `clubId` and the
 * identity of the acting staff member. Both are taken from the session in
 * src/features/admin/server/session.ts. Accepting either from the request
 * would let a signed-in staff member write into another club, or attribute a
 * payment to a colleague.
 */

const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer', 'gcash', 'online'] as const
const BLOCK_KINDS = ['maintenance', 'league', 'private', 'closed'] as const
const PRODUCT_TYPES = ['addon', 'cafe'] as const
const COURT_ENVIRONMENTS = ['indoor', 'outdoor'] as const

/** Lowercase, digits, single hyphens: what survives a URL without escaping. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** A doubles court seats four; the ceiling leaves room for coaching sessions. */
const MAX_PLAYERS_PER_COURT = 32

const paymentMethodFieldsSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  label: z.string().trim().min(1).max(120),
  accountName: z.string().trim().max(160).nullish(),
  accountNumber: z.string().trim().max(160).nullish(),
  instructions: z.string().trim().max(1000).nullish(),
  qrImageUrl: z.url().nullish(),
  requiresProof: z.boolean(),
})

function hasWrittenPaymentGuidance(method: {
  accountName?: string | null
  accountNumber?: string | null
  instructions?: string | null
}): boolean {
  return [method.accountName, method.accountNumber, method.instructions].some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  )
}

function hasPublishedPaymentGuidance(method: {
  accountName?: string | null
  accountNumber?: string | null
  instructions?: string | null
  qrImageUrl?: string | null
}): boolean {
  return hasWrittenPaymentGuidance(method) || Boolean(method.qrImageUrl)
}

/** A new row has no id for a QR upload yet, so it needs useful written guidance. */
export const createPaymentMethodSchema = paymentMethodFieldsSchema.refine(
  hasWrittenPaymentGuidance,
  {
    message: 'Add account details or payment instructions',
    path: ['instructions'],
  },
)

/** Full stored-state validation after an admin patch has been merged. */
export const publishedPaymentMethodSchema = paymentMethodFieldsSchema.refine(
  hasPublishedPaymentGuidance,
  {
    message: 'Add account details, payment instructions, or a QR image',
    path: ['instructions'],
  },
)

const PAYMENT_METHOD_PATCH_FIELDS = [
  'method',
  'label',
  'accountName',
  'accountNumber',
  'instructions',
  'qrImageUrl',
  'requiresProof',
  'isActive',
] as const

export const paymentMethodPatchSchema = paymentMethodFieldsSchema
  .partial()
  .extend({
    id: z.uuid(),
    isActive: z.boolean().optional(),
    acknowledgeCheckoutPause: z.boolean().optional(),
  })
  .refine(
    (method) => PAYMENT_METHOD_PATCH_FIELDS.some((field) => method[field] !== undefined),
    { message: 'Choose at least one payment method detail to change' },
  )

export const movePaymentMethodSchema = z.object({
  id: z.uuid(),
  direction: z.enum(['up', 'down']),
})

export const markBookingPaidSchema = z.object({
  bookingId: z.uuid(),
  method: z.enum(PAYMENT_METHODS),
  amountCents: z.number().int().positive('A payment must be for more than nothing'),
  /** Gateway or deposit-slip reference. Null for cash taken at the counter. */
  externalReference: z.string().trim().max(120).nullish(),
})

export const refundPaymentSchema = z.object({ paymentId: z.uuid() })

/**
 * The statuses the desk can move a booking to. `pending` is absent: it is what
 * `create_booking` opens a booking as, not somewhere staff send one back to.
 * Which of these is reachable from where the booking is now is decided in
 * src/features/admin/server/bookings.ts, against the stored row.
 */
const SETTABLE_BOOKING_STATUSES = [
  'awaiting_payment',
  'confirmed',
  'completed',
  'cancelled',
] as const

export const setBookingStatusSchema = z.object({
  bookingId: z.uuid(),
  status: z.enum(SETTABLE_BOOKING_STATUSES),
})

export const createBlockSchema = z
  .object({
    courtId: z.uuid(),
    kind: z.enum(BLOCK_KINDS),
    reason: z.string().trim().max(200).nullish(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((block) => block.endsAt > block.startsAt, {
    message: 'A block must end after it starts',
    path: ['endsAt'],
  })

export const removeBlockSchema = z.object({ blockId: z.uuid() })

const courtFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(SLUG_PATTERN, 'Use lowercase letters, numbers, and single hyphens'),
  surface: z.string().trim().min(1).max(120),
  environment: z.enum(COURT_ENVIRONMENTS),
  isTournamentGrade: z.boolean(),
  blurb: z.string().trim().max(500).nullish(),
  /** One "Good to know" line per entry — the detail page lists them. */
  notes: z.array(z.string().trim().min(1).max(200)).max(12),
  tags: z.array(z.string().trim().min(1).max(40)).max(12),
  includes: z.array(z.string().trim().min(1).max(120)).max(12),
  heroImageUrl: z.url().nullish(),
  basePriceCents: z.number().int().min(0, 'A price cannot be negative'),
  sortOrder: z.number().int().min(0).max(9999),
  minPlayers: z.number().int().min(1).max(MAX_PLAYERS_PER_COURT),
  maxPlayers: z.number().int().min(1).max(MAX_PLAYERS_PER_COURT),
  /** How many players the slot price covers before the per-head fee starts. */
  includedPlayers: z.number().int().min(1).max(MAX_PLAYERS_PER_COURT),
  extraPlayerFeeCents: z.number().int().min(0, 'A fee cannot be negative'),
})

/**
 * Mirrors the `courts_players_ordered` check constraint, so an inverted band
 * becomes a field error the editor can point at rather than a 23514.
 */
function hasOrderedCapacity(court: {
  minPlayers?: number | null
  maxPlayers?: number | null
}): boolean {
  const { minPlayers, maxPlayers } = court

  if (minPlayers === undefined || minPlayers === null) return true
  if (maxPlayers === undefined || maxPlayers === null) return true

  return maxPlayers >= minPlayers
}

const CAPACITY_MESSAGE = 'The most players cannot be fewer than the fewest'

/**
 * Mirrors `courts_included_within_capacity`.
 *
 * An included count above the maximum would put the extra-player fee out of
 * reach; one below the minimum would charge every booking a fee it can never
 * avoid. Both are almost certainly a typo, so they are refused here rather than
 * surfacing as a 23514 from the database.
 */
function hasIncludedWithinCapacity(court: {
  minPlayers?: number | null
  maxPlayers?: number | null
  includedPlayers?: number | null
}): boolean {
  const { minPlayers, maxPlayers, includedPlayers } = court

  if (includedPlayers === undefined || includedPlayers === null) return true

  const belowFloor = minPlayers != null && includedPlayers < minPlayers
  const aboveCeiling = maxPlayers != null && includedPlayers > maxPlayers

  return !belowFloor && !aboveCeiling
}

const INCLUDED_MESSAGE = 'Players covered by the price must sit inside the court capacity'

export const createCourtSchema = courtFieldsSchema
  .refine(hasOrderedCapacity, { message: CAPACITY_MESSAGE, path: ['maxPlayers'] })
  .refine(hasIncludedWithinCapacity, { message: INCLUDED_MESSAGE, path: ['includedPlayers'] })

/**
 * A patch may move one end of the capacity band on its own. That case is
 * checked against the stored row in the server module, which is the only place
 * that knows the other end; the database check constraint is the backstop.
 */
export const courtPatchSchema = courtFieldsSchema
  .partial()
  .extend({ id: z.uuid(), isActive: z.boolean().optional() })
  .refine(hasOrderedCapacity, { message: CAPACITY_MESSAGE, path: ['maxPlayers'] })
  .refine(hasIncludedWithinCapacity, { message: INCLUDED_MESSAGE, path: ['includedPlayers'] })
  .refine((court) => Object.keys(court).some((key) => key !== 'id'), {
    message: 'Choose at least one court detail to change',
  })

const productFieldsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  type: z.enum(PRODUCT_TYPES),
  priceCents: z.number().int().min(0, 'A price cannot be negative'),
  hasQuantity: z.boolean(),
  imageUrl: z.url().nullish(),
  sortOrder: z.number().int().min(0).max(9999),
})

/** Creating needs every field; patching needs an id and at least one change. */
export const productPatchSchema = productFieldsSchema
  .partial()
  .extend({ id: z.uuid(), isActive: z.boolean().optional() })

export const createProductSchema = productFieldsSchema

/** "HH:MM" or "HH:MM:SS", as a time input and Postgres both produce. */
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

/**
 * The club-wide settings behind the storefront: name, desk phone, opening
 * hours, and the booking rules every court inherits.
 */
export const clubSettingsSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the club name').max(120),
    phone: z.string().trim().max(40).nullish(),
    opensAt: z.string().regex(CLOCK_TIME, 'Enter a valid opening time'),
    closesAt: z.string().regex(CLOCK_TIME, 'Enter a valid closing time'),
    slotMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]),
    minDurationMinutes: z.number().int().min(15).max(1440),
    maxDurationMinutes: z.number().int().min(15).max(1440),
    cancellationWindowHours: z.number().int().min(0).max(168),
    groupBookingNote: z.string().trim().max(1000).nullish(),
  })
  .refine((club) => club.closesAt > club.opensAt, {
    message: 'Closing time must be after opening time',
    path: ['closesAt'],
  })
  .refine((club) => club.maxDurationMinutes >= club.minDurationMinutes, {
    message: 'Longest booking cannot be shorter than the shortest',
    path: ['maxDurationMinutes'],
  })
