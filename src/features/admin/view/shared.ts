import {
  getZonedParts,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  openWindowMinutes,
} from '@/lib/domain/time'
import type { BookingDetail } from '@/lib/repositories/bookings'
import type { Club } from '@/lib/repositories/mappers'

/** Helpers every admin projection needs. Kept here so none of them drift apart. */

const HOURS_PER_DAY = 24

export type OpeningWindow = {
  /** Minutes since club-local midnight. */
  readonly opensAt: number
  /** Past 1440 when the club plays past midnight. */
  readonly closesAt: number
  readonly totalMinutes: number
}

export function openingWindow(club: Club): OpeningWindow {
  const { opensAt, closesAt } = openWindowMinutes(club.opensAt, club.closesAt)

  return { opensAt, closesAt, totalMinutes: closesAt - opensAt }
}

/** A cancelled booking holds no court and earns no money, so nothing counts it. */
export function isLive(detail: BookingDetail): boolean {
  return detail.booking.status !== 'cancelled'
}

/**
 * An interval expressed in club-local minutes since midnight.
 *
 * A club that plays past midnight has a tail: a reading inside that tail (12:30
 * AM, minute 30) is carried onto the end of the day as minute 1470, so a 12:00
 * AM session lands beside the 11:00 PM one instead of at the far left. Pass the
 * window whenever one is in hand — without it, midnight reads as the start of
 * the day.
 */
export function toLocalInterval(
  startsAt: Date,
  endsAt: Date,
  timeZone: string,
  window?: OpeningWindow,
): { readonly from: number; readonly to: number } {
  const rawFrom = getZonedParts(startsAt, timeZone).minutesOfDay
  const tailEnd = window === undefined ? 0 : Math.max(0, window.closesAt - MINUTES_PER_DAY)
  const from = rawFrom < tailEnd ? rawFrom + MINUTES_PER_DAY : rawFrom
  const minutes = (endsAt.getTime() - startsAt.getTime()) / 60_000

  return { from, to: from + minutes }
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

/** "7:00 AM" for the schedule's time gutter. Hour 24 is the 12 AM tail. */
export function formatHourLabel(hour: number): string {
  const hourOfDay = hour % HOURS_PER_DAY
  const suffix = hourOfDay < 12 ? 'AM' : 'PM'
  const hour12 = hourOfDay % 12 === 0 ? 12 : hourOfDay % 12

  return `${hour12}:00 ${suffix}`
}

/** "7am" — the compact form the reports chart uses under each bar. */
export function formatShortHourLabel(hour: number): string {
  const hourOfDay = hour % HOURS_PER_DAY
  const suffix = hourOfDay < 12 ? 'am' : 'pm'
  const hour12 = hourOfDay % 12 === 0 ? 12 : hourOfDay % 12

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
