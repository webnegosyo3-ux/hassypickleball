import { extraPlayerFeeCents, type CapacityBand } from '@/lib/domain/pax'
import { formatMoney } from '@/lib/format/money'
import { buildBookingQuote, type PriceLine } from './booking-quote'
import type { AvailabilitySlot } from '@/lib/services/availability'

/**
 * The booking form's read model.
 *
 * Two jobs, both pure: what the summary says, and exactly what gets posted to
 * the booking action. Keeping the second one out of the component matters most
 * — "what exactly do we send" is the part worth pinning down in a test, and it
 * must never carry a price the server would then be tempted to trust.
 */

export type BookableAddon = {
  readonly id: string
  readonly name: string
  readonly description: string | null
  readonly priceCents: number
}

export type BookingFormContact = {
  readonly contactName: string
  readonly contactEmail: string
  readonly contactPhone: string
  readonly notes: string
  readonly willPresentId: boolean
}

/** The payload the checkout action validates. Prices are deliberately absent. */
export type BookingFormOrder = {
  readonly clubId: string
  readonly contactName: string
  readonly contactEmail: string
  readonly contactPhone: string
  readonly willPresentId: boolean
  readonly notes: string | null
  readonly paymentMethodId: string
  readonly courts: ReadonlyArray<{
    readonly courtId: string
    readonly startsAt: string
    readonly endsAt: string
  }>
  readonly items: ReadonlyArray<{ readonly productId: string; readonly quantity: number }>
  /** Everyone playing, in the order the booker named them. */
  readonly players: readonly string[]
}

export type BuildBookingFormOrderInput = {
  readonly clubId: string
  readonly courtId: string
  /** Null until a start time is picked — there is nothing to book yet. */
  readonly slot: AvailabilitySlot | null
  readonly contact: BookingFormContact
  readonly addonIds: readonly string[]
  readonly players: readonly string[]
  readonly paymentMethodId: string | null
}

/** The order to send, or null while no slot has been chosen. */
export function buildBookingFormOrder(input: BuildBookingFormOrderInput): BookingFormOrder | null {
  const { slot } = input

  if (!slot || !input.paymentMethodId) {
    return null
  }

  const notes = input.contact.notes.trim()

  return {
    clubId: input.clubId,
    contactName: input.contact.contactName.trim(),
    contactEmail: input.contact.contactEmail.trim(),
    contactPhone: input.contact.contactPhone.trim(),
    willPresentId: input.contact.willPresentId,
    notes: notes.length > 0 ? notes : null,
    paymentMethodId: input.paymentMethodId,
    courts: [
      {
        courtId: input.courtId,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
      },
    ],
    items: input.addonIds.map((productId) => ({ productId, quantity: 1 })),
    // Blank rows are dropped rather than sent: a booker leaving the last row
    // empty means a smaller party, not a player with no name.
    players: input.players.map((player) => player.trim()).filter((player) => player.length > 0),
  }
}

export type BookingFormSummary = {
  readonly lines: readonly PriceLine[]
  readonly total: string
  readonly totalCents: number
  /** Heads beyond what the slot price covers, and what they add. */
  readonly extraPlayers: number
  readonly extraPlayersCents: number
  readonly hasSlot: boolean
}

export type BuildBookingFormSummaryInput = {
  readonly courtName: string
  readonly durationMinutes: number
  readonly slotPriceCents: number | null
  readonly addons: readonly BookableAddon[]
  readonly addonIds: readonly string[]
  readonly partySize: number
  readonly band: CapacityBand
  readonly currency: string
}

/**
 * The price breakdown beside the form.
 *
 * The court price has already been quoted by `quoteCourtSegment` on the server;
 * this only explains it and adds what the customer ticked. Extra heads ride in
 * as one more line of the same quote, so the total the button shows and the
 * lines above it can never add up differently.
 */
export function buildBookingFormSummary(input: BuildBookingFormSummaryInput): BookingFormSummary {
  const extraPlayers = Math.max(0, input.partySize - input.band.includedPlayers)
  const extraPlayersCents = extraPlayerFeeCents(input.partySize, input.band)

  const quote = buildBookingQuote({
    courtName: input.courtName,
    durationMinutes: input.durationMinutes,
    courtPriceCents: input.slotPriceCents,
    discountCents: 0,
    addons: [
      ...input.addons
        .filter((addon) => input.addonIds.includes(addon.id))
        .map((addon) => ({
          productId: addon.id,
          name: addon.name,
          unitPriceCents: addon.priceCents,
          quantity: 1,
        })),
      ...(extraPlayersCents > 0
        ? [
            {
              productId: 'extra-players',
              name: 'Extra players',
              unitPriceCents: input.band.extraPlayerFeeCents,
              quantity: extraPlayers,
            },
          ]
        : []),
    ],
    currency: input.currency,
  })

  return {
    lines: quote.lines,
    total: quote.total,
    totalCents: quote.totalCents,
    extraPlayers,
    extraPlayersCents,
    hasSlot: quote.hasCourt,
  }
}

/** The add-on's own price, formatted for its checkbox row. */
export function formatAddonPrice(addon: BookableAddon, currency: string): string {
  return formatMoney(addon.priceCents, currency)
}
