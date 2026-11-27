import {
  formatShortHourLabel,
  isLive,
  MINUTES_PER_HOUR,
  openHours,
  openingWindow,
  overlapMinutes,
  toLocalInterval,
  toPercent,
} from './shared'
import type { StatCard } from './schedule-stats'
import { formatMoney } from '@/lib/format/money'
import type { BookingDetail } from '@/lib/repositories/bookings'
import type { Club, Court } from '@/lib/repositories/mappers'

/** The aggregates behind the Reports screen. */

export type UtilizationBar = {
  readonly label: string
  readonly percent: number
}

export type CourtRevenue = {
  readonly courtId: string
  readonly name: string
  readonly value: string
  readonly percent: number
}

export type Report = {
  readonly stats: readonly StatCard[]
  readonly utilization: readonly UtilizationBar[]
  readonly revenueByCourt: readonly CourtRevenue[]
  readonly attachRatePercent: number
}

export type ReportInput = {
  readonly club: Club
  readonly courts: readonly Court[]
  readonly bookings: readonly BookingDetail[]
  /** Calendar days covered, so utilization is averaged over the range, not one day. */
  readonly days: number
  readonly day: string
}

type LocalSegment = {
  readonly courtId: string
  readonly from: number
  readonly to: number
  readonly priceCents: number
}

function localSegments(input: ReportInput): readonly LocalSegment[] {
  const window = openingWindow(input.club)

  return input.bookings.filter(isLive).flatMap((detail) =>
    detail.segments.map((segment) => ({
      courtId: segment.courtId,
      priceCents: segment.priceCents,
      ...toLocalInterval(segment.startsAt, segment.endsAt, input.club.timeZone, window),
    })),
  )
}

function utilizationBars(
  segments: readonly LocalSegment[],
  input: ReportInput,
): readonly UtilizationBar[] {
  // Capacity for one clock hour: every court, on every day in the range.
  const hourCapacity = input.courts.length * MINUTES_PER_HOUR * Math.max(1, input.days)

  return openHours(openingWindow(input.club)).map((hour) => {
    const bucket = {
      from: hour * MINUTES_PER_HOUR,
      to: (hour + 1) * MINUTES_PER_HOUR,
    }
    const booked = segments.reduce((total, segment) => total + overlapMinutes(segment, bucket), 0)

    return { label: formatShortHourLabel(hour), percent: toPercent(booked, hourCapacity) }
  })
}

function revenueByCourt(
  segments: readonly LocalSegment[],
  input: ReportInput,
): readonly CourtRevenue[] {
  const totals = input.courts.map((court) => ({
    court,
    cents: segments
      .filter((segment) => segment.courtId === court.id)
      .reduce((total, segment) => total + segment.priceCents, 0),
  }))

  // Bars are relative to the strongest court, so the leader always reads 100%.
  const top = Math.max(...totals.map((entry) => entry.cents), 0)

  return [...totals]
    .sort((a, b) => b.cents - a.cents)
    .map(({ court, cents }) => ({
      courtId: court.id,
      name: court.name,
      value: formatMoney(cents, input.club.currency),
      percent: toPercent(cents, top),
    }))
}

export function buildReports(input: ReportInput): Report {
  const live = input.bookings.filter(isLive)
  const segments = localSegments(input)
  const window = openingWindow(input.club)

  const revenueCents = live.reduce((total, detail) => total + detail.booking.totalCents, 0)
  const addOnCents = live.reduce((total, detail) => total + detail.booking.itemsSubtotalCents, 0)
  const bookedMinutes = segments.reduce((total, segment) => total + (segment.to - segment.from), 0)
  const capacity = input.courts.length * window.totalMinutes * Math.max(1, input.days)
  const withAddOns = live.filter((detail) => detail.items.length > 0).length

  return {
    stats: [
      {
        label: 'Revenue',
        value: formatMoney(revenueCents, input.club.currency),
        detail: `Across ${input.days} ${input.days === 1 ? 'day' : 'days'}`,
      },
      {
        label: 'Bookings',
        value: `${live.length}`,
        detail: `${withAddOns} added something`,
      },
      {
        label: 'Avg utilization',
        value: `${toPercent(bookedMinutes, capacity)}%`,
        detail: 'Of open court hours',
      },
      {
        label: 'Add-on revenue',
        value: formatMoney(addOnCents, input.club.currency),
        detail: 'Café and equipment',
      },
    ],
    utilization: utilizationBars(segments, input),
    revenueByCourt: revenueByCourt(segments, input),
    attachRatePercent: toPercent(withAddOns, live.length),
  }
}
