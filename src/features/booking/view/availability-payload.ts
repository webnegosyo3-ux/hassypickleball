import type { AvailabilitySlot } from '@/lib/services/availability'

/**
 * Availability over the wire.
 *
 * The court page ships the day it was rendered for, then asks for any other
 * day or month from `/api/availability`. A route handler rather than a server
 * action on purpose: the calendar has to answer a signed-out visitor, and the
 * actions meter every call through a client that a bare visitor cannot produce.
 *
 * Dates travel as ISO strings. `Date` does not survive JSON, and reviving it on
 * the wrong side is how a slot ends up an hour off.
 */

export type SerialisedSlot = {
  readonly startsAt: string
  readonly endsAt: string
  readonly priceCents: number
  readonly isAvailable: boolean
  readonly isBlocked: boolean
  readonly isPast: boolean
}

export type AvailabilityPayload = {
  /** The day whose slots are in `slots`, or null when none was asked for. */
  readonly day: string | null
  /** The month the counts in `days` belong to, or null. */
  readonly month: string | null
  readonly durationMinutes: number
  readonly slots: readonly SerialisedSlot[]
  /** Open start times keyed by day, for `month`. Null when no month was asked for. */
  readonly days: Readonly<Record<string, number>> | null
  /** The sentence a customer should read, or null when the read succeeded. */
  readonly error: string | null
}

export function serialiseSlot(slot: AvailabilitySlot): SerialisedSlot {
  return {
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    priceCents: slot.priceCents,
    isAvailable: slot.isAvailable,
    isBlocked: slot.isBlocked,
    isPast: slot.isPast,
  }
}

/** Back to the shape the pricing and slot views already speak. */
export function toSlot(slot: SerialisedSlot): AvailabilitySlot {
  return {
    startsAt: new Date(slot.startsAt),
    endsAt: new Date(slot.endsAt),
    priceCents: slot.priceCents,
    isAvailable: slot.isAvailable,
    isBlocked: slot.isBlocked,
    isPast: slot.isPast,
  }
}

function isSlot(value: unknown): value is SerialisedSlot {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const slot = value as Record<string, unknown>

  return (
    typeof slot.startsAt === 'string' &&
    typeof slot.endsAt === 'string' &&
    typeof slot.priceCents === 'number'
  )
}

function isCountMap(value: unknown): value is Record<string, number> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((count) => typeof count === 'number')
  )
}

/**
 * A response, or null if it is not one. Nothing here trusts the shape: the
 * payload crosses a network boundary, and a half-understood answer would put
 * times on screen that the server never offered.
 */
export function parseAvailabilityPayload(raw: unknown): AvailabilityPayload | null {
  if (typeof raw !== 'object' || raw === null) {
    return null
  }

  const value = raw as Record<string, unknown>
  const slots = Array.isArray(value.slots) ? value.slots.filter(isSlot) : []
  const days = isCountMap(value.days) ? value.days : null

  return {
    day: typeof value.day === 'string' ? value.day : null,
    month: typeof value.month === 'string' ? value.month : null,
    durationMinutes: typeof value.durationMinutes === 'number' ? value.durationMinutes : 0,
    slots,
    days,
    error: typeof value.error === 'string' ? value.error : null,
  }
}
