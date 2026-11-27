import {
  coveredMinutes,
  formatHourLabel,
  isLive,
  MINUTES_PER_HOUR,
  openHours,
  openingWindow,
  overlapMinutes,
  toLocalInterval,
  type OpeningWindow,
} from './shared'
import { formatMoney } from '@/lib/format/money'
import { formatTimeInZone } from '@/lib/format/time'
import type { AvailabilityBlock } from '@/lib/repositories/booking-mappers'
import type { BookingDetail } from '@/lib/repositories/bookings'
import type { Club, Court } from '@/lib/repositories/mappers'
import type { Enums } from '@/lib/repositories/rows'

/**
 * The day view of the court schedule, as pure geometry.
 *
 * Every entry is placed as a percentage of the club's opening window rather
 * than in pixels, so the component owns only the row height. Instants arrive in
 * UTC and are read through the club's timezone — a booking must sit at the
 * club's 5pm no matter where the browser is.
 */

export type ScheduleTone = 'confirmed' | 'awaiting' | 'blocked' | 'event'

export type ScheduleEntry = {
  readonly id: string
  readonly title: string
  readonly detail: string
  readonly tone: ScheduleTone
  readonly topPercent: number
  readonly heightPercent: number
  /**
   * Set only for staff-created holds. A block can be released; a booking is
   * cancelled through its own screen, so the grid must be able to tell them
   * apart without re-deriving it from the tone.
   */
  readonly blockId: string | null
}

export type ScheduleColumn = {
  readonly courtId: string
  readonly courtName: string
  /** "Indoor · ₱600/hr" — the sub-label under each column heading. */
  readonly meta: string
  readonly entries: readonly ScheduleEntry[]
  /** Minutes of the opening window still free on this court. */
  readonly openMinutes: number
  /** "12.5 hrs open", or "Fully booked" when nothing is left. */
  readonly openLabel: string
  /**
   * "2 bookings · 1 hold", or "Nothing booked".
   *
   * The desk's first question about a court is whether anyone has it, and the
   * colour of an entry answers it only if you scan the whole column. This says
   * it in words, above the grid as well as in the phone list.
   */
  readonly summary: string
}

export type ScheduleGrid = {
  readonly hourLabels: readonly string[]
  readonly columns: readonly ScheduleColumn[]
}

export type ScheduleGridInput = {
  readonly club: Club
  readonly courts: readonly Court[]
  readonly bookings: readonly BookingDetail[]
  readonly blocks: readonly AvailabilityBlock[]
  /** Club-local calendar day, "YYYY-MM-DD". Present for symmetry with the loader. */
  readonly day: string
}

const BLOCK_LABELS: Record<Enums['block_kind'], string> = {
  maintenance: 'Maintenance',
  league: 'League',
  private: 'Private hire',
  closed: 'Closed',
}

const BLOCK_TONES: Record<Enums['block_kind'], ScheduleTone> = {
  maintenance: 'blocked',
  closed: 'blocked',
  league: 'event',
  private: 'event',
}

type Placed = {
  readonly entry: ScheduleEntry
  /** Clipped club-local minutes, used for ordering and for the open total. */
  readonly from: number
  readonly to: number
}

/**
 * Clips an interval to the opening window and turns it into percentages.
 * Returns null when nothing of it is visible, so closed-hours work does not
 * render as a zero-height sliver at the edge of the grid.
 */
function place(
  from: number,
  to: number,
  window: OpeningWindow,
): {
  readonly topPercent: number
  readonly heightPercent: number
  readonly from: number
  readonly to: number
} | null {
  const visible = overlapMinutes({ from, to }, { from: window.opensAt, to: window.closesAt })

  if (visible <= 0) {
    return null
  }

  const clippedFrom = Math.max(from, window.opensAt)

  return {
    topPercent: ((clippedFrom - window.opensAt) / window.totalMinutes) * 100,
    heightPercent: (visible / window.totalMinutes) * 100,
    from: clippedFrom,
    to: clippedFrom + visible,
  }
}

function bookingTone(status: BookingDetail['booking']['status']): ScheduleTone {
  return status === 'confirmed' || status === 'completed' ? 'confirmed' : 'awaiting'
}

function environmentLabel(environment: Court['environment']): string {
  return environment.charAt(0).toUpperCase() + environment.slice(1)
}

function bookingEntries(
  courtId: string,
  input: ScheduleGridInput,
  window: OpeningWindow,
): Placed[] {
  const timeZone = input.club.timeZone

  return input.bookings.filter(isLive).flatMap((detail) =>
    detail.segments
      .filter((segment) => segment.courtId === courtId)
      .flatMap((segment) => {
        const { from, to } = toLocalInterval(segment.startsAt, segment.endsAt, timeZone)
        const placed = place(from, to, window)

        if (!placed) {
          return []
        }

        return [
          {
            from: placed.from,
            to: placed.to,
            entry: {
              id: segment.id,
              title: detail.booking.contactName,
              detail: `${formatTimeInZone(segment.startsAt, timeZone)} – ${formatTimeInZone(segment.endsAt, timeZone)}`,
              tone: bookingTone(detail.booking.status),
              topPercent: placed.topPercent,
              heightPercent: placed.heightPercent,
              blockId: null,
            },
          },
        ]
      }),
  )
}

function blockEntries(courtId: string, input: ScheduleGridInput, window: OpeningWindow): Placed[] {
  const timeZone = input.club.timeZone

  return input.blocks
    .filter((block) => block.courtId === courtId)
    .flatMap((block) => {
      const { from, to } = toLocalInterval(block.startsAt, block.endsAt, timeZone)
      const placed = place(from, to, window)

      if (!placed) {
        return []
      }

      return [
        {
          from: placed.from,
          to: placed.to,
          entry: {
            id: block.id,
            title: block.reason ?? BLOCK_LABELS[block.kind],
            detail: `${formatTimeInZone(block.startsAt, timeZone)} – ${formatTimeInZone(block.endsAt, timeZone)}`,
            tone: BLOCK_TONES[block.kind],
            topPercent: placed.topPercent,
            heightPercent: placed.heightPercent,
            blockId: block.id,
          },
        },
      ]
    })
}

/**
 * Minutes the court is spoken for, counting overlapping holds once.
 *
 * A block laid over a booking is two entries covering one stretch of time, so
 * summing the entries would report more held minutes than the day contains and
 * leave the open total negative.
 */
function heldMinutes(placed: readonly Placed[]): number {
  return coveredMinutes(placed)
}

/** "12.5 hrs open" — halves are the finest granularity the club books in. */
function openLabel(minutes: number): string {
  if (minutes <= 0) {
    return 'Fully booked'
  }

  const hours = Math.round((minutes / MINUTES_PER_HOUR) * 2) / 2

  return `${hours} ${hours === 1 ? 'hr' : 'hrs'} open`
}

export const NOTHING_BOOKED = 'Nothing booked'

function countLabel(count: number, noun: string): readonly string[] {
  return count === 0 ? [] : [`${count} ${noun}${count === 1 ? '' : 's'}`]
}

/**
 * What the court is carrying, counted the way staff talk about it: a booking
 * is a guest on the court, a hold is the club taking the time back.
 */
function summarise(entries: readonly ScheduleEntry[]): string {
  const holds = entries.filter((entry) => entry.blockId !== null).length

  const parts = [...countLabel(entries.length - holds, 'booking'), ...countLabel(holds, 'hold')]

  return parts.length === 0 ? NOTHING_BOOKED : parts.join(' · ')
}

export function buildScheduleGrid(input: ScheduleGridInput): ScheduleGrid {
  const window = openingWindow(input.club)

  const columns = input.courts.map((court) => {
    const placed = [
      ...bookingEntries(court.id, input, window),
      ...blockEntries(court.id, input, window),
    ].sort((a, b) => a.from - b.from)

    const openMinutes = Math.max(0, window.totalMinutes - heldMinutes(placed))
    const entries = placed.map((entry) => entry.entry)

    return {
      courtId: court.id,
      courtName: court.name,
      meta: `${environmentLabel(court.environment)} · ${formatMoney(court.basePriceCents, input.club.currency)}/hr`,
      entries,
      openMinutes,
      openLabel: openLabel(openMinutes),
      summary: summarise(entries),
    }
  })

  return { hourLabels: openHours(window).map(formatHourLabel), columns }
}
