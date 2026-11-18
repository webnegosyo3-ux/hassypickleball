import type { CourtEnvironment, Enums, ProductType } from './rows'
import type { CustomerTier, PricingRule, RateKind } from '@/lib/domain/types'

/**
 * Row → domain mapping. Kept separate from the queries so the translation is
 * unit-testable without a database, and so snake_case never leaks past this file.
 */

export type Club = {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly timeZone: string
  readonly currency: string
  readonly opensAt: string
  readonly closesAt: string
  readonly slotMinutes: number
  readonly minDurationMinutes: number
  readonly maxDurationMinutes: number
  /** Desk number shown on the court detail page. Null until a club fills it in. */
  readonly phone: string | null
  /** Hours before start that a booking can still be cancelled free of charge. */
  readonly cancellationWindowHours: number
  readonly groupBookingNote: string | null
}

export type Court = {
  readonly id: string
  readonly clubId: string
  readonly name: string
  readonly slug: string
  readonly surface: string
  readonly environment: CourtEnvironment
  readonly isTournamentGrade: boolean
  readonly blurb: string | null
  /** One "Good to know" line per entry — the design lists them, not one paragraph. */
  readonly notes: readonly string[]
  readonly tags: readonly string[]
  readonly includes: readonly string[]
  readonly heroImageUrl: string | null
  readonly basePriceCents: number
  readonly sortOrder: number
  readonly isActive: boolean
  /** Player capacity ("pax"). Bounds what a guest may pick at booking. */
  readonly minPlayers: number
  readonly maxPlayers: number
  /** How many players the slot price already covers. */
  readonly includedPlayers: number
  /** Charged per head beyond `includedPlayers`. */
  readonly extraPlayerFeeCents: number
}

export type Product = {
  readonly id: string
  readonly clubId: string
  readonly name: string
  readonly description: string | null
  readonly type: ProductType
  readonly priceCents: number
  readonly hasQuantity: boolean
  readonly imageUrl: string | null
  readonly sortOrder: number
  readonly isActive: boolean
}

/**
 * A payment channel as the club publishes it. `method` is the enum the
 * resulting `payments` row is filed under; everything else is copy the guest
 * reads at checkout.
 */
export type PaymentMethod = {
  readonly id: string
  readonly clubId: string
  readonly method: Enums['payment_method']
  readonly label: string
  readonly accountName: string | null
  readonly accountNumber: string | null
  readonly instructions: string | null
  readonly qrImageUrl: string | null
  /** Whether checkout must carry a screenshot of the transfer. */
  readonly requiresProof: boolean
  readonly sortOrder: number
  readonly isActive: boolean
}

/** Postgres numeric columns arrive as strings over PostgREST. */
function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }

  return typeof value === 'number' ? value : Number(value)
}

export function toClub(row: {
  id: string
  name: string
  slug: string
  timezone: string
  currency: string
  opens_at: string
  closes_at: string
  slot_minutes: number
  min_duration_minutes: number
  max_duration_minutes: number
  phone: string | null
  cancellation_window_hours: number
  group_booking_note: string | null
}): Club {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    timeZone: row.timezone,
    currency: row.currency,
    opensAt: row.opens_at,
    closesAt: row.closes_at,
    slotMinutes: row.slot_minutes,
    minDurationMinutes: row.min_duration_minutes,
    maxDurationMinutes: row.max_duration_minutes,
    phone: row.phone,
    cancellationWindowHours: row.cancellation_window_hours,
    groupBookingNote: row.group_booking_note,
  }
}

export function toCourt(row: {
  id: string
  club_id: string
  name: string
  slug: string
  surface: string
  environment: CourtEnvironment
  is_tournament_grade: boolean
  blurb: string | null
  notes: string[] | null
  tags: string[] | null
  includes: string[] | null
  hero_image_url: string | null
  base_price_cents: number
  sort_order: number
  is_active: boolean
  min_players: number
  max_players: number
  included_players: number
  extra_player_fee_cents: number
}): Court {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    slug: row.slug,
    surface: row.surface,
    environment: row.environment,
    isTournamentGrade: row.is_tournament_grade,
    blurb: row.blurb,
    notes: row.notes ?? [],
    tags: row.tags ?? [],
    includes: row.includes ?? [],
    heroImageUrl: row.hero_image_url,
    basePriceCents: row.base_price_cents,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    includedPlayers: row.included_players,
    extraPlayerFeeCents: row.extra_player_fee_cents,
  }
}

export function toProduct(row: {
  id: string
  club_id: string
  name: string
  description: string | null
  type: ProductType
  price_cents: number
  has_quantity: boolean
  image_url: string | null
  sort_order: number
  is_active: boolean
}): Product {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    description: row.description,
    type: row.type,
    priceCents: row.price_cents,
    hasQuantity: row.has_quantity,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

export function toPricingRule(row: {
  id: string
  court_id: string | null
  label: string
  days_of_week: number[] | null
  starts_at_time: string | null
  ends_at_time: string | null
  min_duration_minutes: number | null
  applies_to_tier: CustomerTier | null
  kind: RateKind
  value_cents: number | null
  value_percent: string | number | null
  priority: number
  is_active: boolean
}): PricingRule {
  return {
    id: row.id,
    label: row.label,
    courtId: row.court_id,
    daysOfWeek: row.days_of_week ?? [],
    startsAtTime: row.starts_at_time,
    endsAtTime: row.ends_at_time,
    minDurationMinutes: row.min_duration_minutes,
    appliesToTier: row.applies_to_tier,
    kind: row.kind,
    valueCents: row.value_cents,
    valuePercent: toNullableNumber(row.value_percent),
    priority: row.priority,
    isActive: row.is_active,
  }
}

export function toPaymentMethod(row: {
  id: string
  club_id: string
  method: Enums['payment_method']
  label: string
  account_name: string | null
  account_number: string | null
  instructions: string | null
  qr_image_url: string | null
  requires_proof: boolean
  sort_order: number
  is_active: boolean
}): PaymentMethod {
  return {
    id: row.id,
    clubId: row.club_id,
    method: row.method,
    label: row.label,
    accountName: row.account_name,
    accountNumber: row.account_number,
    instructions: row.instructions,
    qrImageUrl: row.qr_image_url,
    requiresProof: row.requires_proof,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}
