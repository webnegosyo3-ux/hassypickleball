import {
  coveredMinutes,
  isLive,
  openingWindow,
  toLocalInterval,
  toPercent,
  type OpeningWindow,
} from './shared'
import { formatMoney } from '@/lib/format/money'
import type { AvailabilityBlock } from '@/lib/repositories/booking-mappers'
import type { BookingDetail } from '@/lib/repositories/bookings'
import type { Club, Court } from '@/lib/repositories/mappers'

/** The four cards above the schedule grid. */

export type StatCard = {
  readonly label: string
  readonly value: string
  readonly detail: string
}

export type ScheduleStatsInput = {
  readonly club: Club
  readonly courts: readonly Court[]
  readonly bookings: readonly BookingDetail[]
  /** Staff holds: they take court time too, so utilization cannot ignore them. */
  readonly blocks: readonly AvailabilityBlock[]
  /** Club-local day being viewed, "YYYY-MM-DD". */
  readonly day: string
  /** Club-local today, so a card only says "today" when it is. */
  readonly today: string
}

/** Both statuses mean the club is still owed money for a live booking. */
const UNPAID_STATUSES = ['pending', 'awaiting_payment'] as const

/** The visible part of an interval, or nothing when it falls outside opening hours. */
function withinWindow(
  interval: { readonly from: number; readonly to: number },
  window: OpeningWindow,
): readonly { readonly from: number; readonly to: number }[] {
  const from = Math.max(interval.from, window.opensAt)
  const to = Math.min(interval.to, window.closesAt)

  return to > from ? [{ from, to }] : []
}

/**
 * Minutes the courts are spoken for: booked segments and staff holds, clipped
 * to opening hours and counted once where they overlap.
 *
 * Per court, then added up. Four courts all held for the same evening are four
 * courts' worth of unsellable time, not one — unioning them together made the
 * card report a fraction of what the grid beside it showed.
 */
function occupiedMinutes(input: ScheduleStatsInput, window: OpeningWindow): number {
  const timeZone = input.club.timeZone
  const spansByCourt = new Map<string, { readonly from: number; readonly to: number }[]>()

  function add(courtId: string, span: { readonly from: number; readonly to: number }) {
    spansByCourt.set(courtId, [...(spansByCourt.get(courtId) ?? []), ...withinWindow(span, window)])
  }

  for (const detail of input.bookings.filter(isLive)) {
    for (const segment of detail.segments) {
      add(segment.courtId, toLocalInterval(segment.startsAt, segment.endsAt, timeZone))
    }
  }

  for (const block of input.blocks) {
    add(block.courtId, toLocalInterval(block.startsAt, block.endsAt, timeZone))
  }

  return [...spansByCourt.values()].reduce((total, spans) => total + coveredMinutes(spans), 0)
}

export function buildScheduleStats(input: ScheduleStatsInput): readonly StatCard[] {
  const live = input.bookings.filter(isLive)
  const window = openingWindow(input.club)
  const isToday = input.day === input.today

  const capacityMinutes = input.courts.length * window.totalMinutes
  const unpaid = live.filter((detail) => {
    return (UNPAID_STATUSES as readonly string[]).includes(detail.booking.status)
  })

  const revenueCents = live.reduce((total, detail) => total + detail.booking.totalCents, 0)
  const addOnCents = live.reduce((total, detail) => total + detail.booking.itemsSubtotalCents, 0)

  return [
    {
      // The screen can be showing any day; calling last Tuesday "Today" made the
      // card look wrong rather than the day look different.
      label: isToday ? 'Today' : 'Bookings',
      value: `${live.length} ${live.length === 1 ? 'booking' : 'bookings'}`,
      detail: `${input.courts.length} ${input.courts.length === 1 ? 'court' : 'courts'} open`,
    },
    {
      label: 'Utilization',
      value: `${toPercent(occupiedMinutes(input, window), capacityMinutes)}%`,
      detail: 'Of the day’s court hours',
    },
    {
      label: 'Awaiting payment',
      value: `${unpaid.length}`,
      detail: unpaid.length === 0 ? 'Everything is settled' : 'Chase before the session starts',
    },
    {
      label: isToday ? 'Revenue today' : 'Revenue',
      value: formatMoney(revenueCents, input.club.currency),
      detail: `${formatMoney(addOnCents, input.club.currency)} from add-ons`,
    },
  ]
}
