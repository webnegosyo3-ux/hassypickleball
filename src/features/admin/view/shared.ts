import { getZonedParts, MINUTES_PER_DAY, MINUTES_PER_HOUR, parseClockTime } from '@/lib/domain/time'
import type { BookingDetail } from '@/lib/repositories/bookings'
import type { Club } from '@/lib/repositories/mappers'

/** Helpers every admin projection needs. Kept here so none of them drift apart. */

export type OpeningWindow = {
  /** Minutes since club-local midnight. */
  readonly opensAt: number
  readonly closesAt: number
  readonly totalMinutes: number
}

export function openingWindow(club: Club): OpeningWindow {
  const opensAt = parseClockTime(club.opensAt)
  const closesAt = parseClockTime(club.closesAt)

  return { opensAt, closesAt, totalMinutes: closesAt - opensAt }
}

/** A cancelled booking holds no court and earns no money, so nothing counts it. */
export function isLive(detail: BookingDetail): boolean {
  return detail.booking.status !== 'cancelled'
}

/**
 * An interval expressed in club-local minutes since midnight.
 *
 * An interval that ends at or before it starts has crossed midnight; it is
 * carried to the end of the day rather than folded back to a negative length.
 */
export function toLocalInterval(
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
): { readonly from: number; readonly to: number } {
  const from = getZonedParts(startsAt, timeZone).minutesOfDay
  const rawTo = getZonedParts(endsAt, timeZone).minutesOfDay

  return { from, to: rawTo > from ? rawTo : MINUTES_PER_DAY }
}

/** Minutes shared by two half-open intervals; never negative. */
export function overlapMinutes(
  a: { readonly from: number; readonly to: number },
  b: { readonly from: number; readonly to: number },
): number {
  return Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from))
}

/**
 * Minutes covered by the union of these intervals — an overlap counts once.
 *
 * A block laid over a booking is two intervals covering one stretch of time, so
 * summing them would report more occupied minutes than the day contains and
 * leave the open total negative.
 */
export function coveredMinutes(
  intervals: readonly { readonly from: number; readonly to: number }[],
): number {
  const sorted = [...intervals].sort((left, right) => left.from - right.from)

  return sorted.reduce<{ readonly total: number; readonly coveredTo: number }>(
    (state, span) => {
      const from = Math.max(span.from, state.coveredTo)

      return span.to <= from ? state : { total: state.total + (span.to - from), coveredTo: span.to }
    },
    { total: 0, coveredTo: -Infinity },
  ).total
}

/** "7:00 AM" for the schedule's time gutter. */
export function formatHourLabel(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12

  return `${hour12}:00 ${suffix}`
}

/** "7am" — the compact form the reports chart uses under each bar. */
export function formatShortHourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12

  return `${hour12}${suffix}`
}

/** The open hours of a club day, as whole hour numbers. */
export function openHours(window: OpeningWindow): number[] {
  const first = Math.floor(window.opensAt / MINUTES_PER_HOUR)
  const last = Math.ceil(window.closesAt / MINUTES_PER_HOUR) - 1

  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index)
}

export function toPercent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export { MINUTES_PER_HOUR }
