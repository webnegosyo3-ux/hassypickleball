import { formatTimeInZone } from '@/lib/format/time'
import { formatMoney } from '@/lib/format/money'
import type { AvailabilitySlot } from '@/lib/services/availability'

/**
 * The court detail page's read model.
 *
 * The page itself only positions what these functions return: the date strip
 * across the top of the picker, the duration pills, and one row per start
 * time. Keeping the derivation here means the wording and the state machine
 * are testable without a DOM, and the component stays declarative.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTES_PER_HOUR = 60

/** The session lengths the design offers, before the club's own limits apply. */
const DURATION_CHOICES = [30, 60, 90, 120] as const

export type DateOption = {
  /** Club-local calendar day, "YYYY-MM-DD" — the shape the day param takes. */
  readonly day: string
  readonly weekday: string
  readonly dayOfMonth: string
  readonly isSelected: boolean
}

export type BuildDateStripInput = {
  readonly selectedDay: string
  /**
   * The first day shown in the strip. Defaults to `selectedDay` when omitted,
   * which keeps the original behaviour for callers that do not need a
   * sliding window.
   */
  readonly startDay?: string
  readonly timeZone: string
  readonly days: number
}

/**
 * The horizontal date picker. Runs forward from `startDay` (or `selectedDay`
 * when `startDay` is not given) rather than centring on the selection, so the
 * strip never offers a day already in the past, and the prev/next controls can
 * shift the visible window without changing the active day.
 *
 * Days are stepped at noon UTC: adding 24 hours to midnight lands on the
 * previous day in any zone behind UTC once a DST shift is involved.
 */
export function buildDateStrip(input: BuildDateStripInput): readonly DateOption[] {
  const start = new Date(`${input.startDay ?? input.selectedDay}T12:00:00Z`)

  return Array.from({ length: input.days }, (_unused, offset) => {
    const date = new Date(start.getTime() + offset * DAY_MS)
    const day = date.toISOString().slice(0, 10)

    return {
      day,
      weekday: new Intl.DateTimeFormat('en-US', {
        timeZone: input.timeZone,
        weekday: 'short',
      }).format(date),
      dayOfMonth: String(date.getUTCDate()),
      isSelected: day === input.selectedDay,
    }
  })
}

export type DurationOption = {
  readonly minutes: number
  readonly label: string
  readonly isSelected: boolean
}

export type BuildDurationOptionsInput = {
  readonly club: {
    readonly minDurationMinutes: number
    readonly maxDurationMinutes: number
  }
  readonly durationMinutes: number
}

/** "30 min", "1 hour", "1.5 hours" — the design's own wording for a length. */
function durationLabel(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) {
    return `${minutes} min`
  }

  const hours = minutes / MINUTES_PER_HOUR

  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

/**
 * The duration pills. Lengths outside the club's own min/max are dropped
 * rather than shown and rejected — `getAvailability` validates the same
 * bounds, so offering one would produce an error the customer cannot fix.
 */
export function buildDurationOptions(input: BuildDurationOptionsInput): readonly DurationOption[] {
  return DURATION_CHOICES.filter(
    (minutes) =>
      minutes >= input.club.minDurationMinutes && minutes <= input.club.maxDurationMinutes,
  ).map((minutes) => ({
    minutes,
    label: durationLabel(minutes),
    isSelected: minutes === input.durationMinutes,
  }))
}

/**
 * Where a row sits relative to the current selection.
 *
 * `included` is the middle of a multi-slot booking: free, but not separately
 * bookable, because the customer already owns that time.
 */
export type SlotState = 'selected' | 'included' | 'available' | 'booked'

export type SlotRow = {
  readonly startsAt: Date
  readonly time: string
  readonly label: string
  readonly price: string
  readonly state: SlotState
  readonly isSelectable: boolean
}

export type BuildSlotRowsInput = {
  readonly slots: readonly AvailabilitySlot[]
  readonly selectedStartsAt: Date | null
  readonly durationMinutes: number
  readonly timeZone: string
  readonly currency: string
}

function stateOf(
  slot: AvailabilitySlot,
  selection: { readonly from: number; readonly to: number } | null,
): SlotState {
  if (!slot.isAvailable) {
    return 'booked'
  }

  if (selection === null) {
    return 'available'
  }

  const startsAt = slot.startsAt.getTime()

  if (startsAt === selection.from) {
    return 'selected'
  }

  return startsAt > selection.from && startsAt < selection.to ? 'included' : 'available'
}

/**
 * The cheapest rate on the day, used to badge off-peak rows.
 *
 * Peak pricing comes from `pricing_rules`, which the page never sees — the
 * quoted prices are all it has. Comparing against the day's floor recovers
 * the distinction the design draws without duplicating the rule engine.
 */
function lowestPriceCents(slots: readonly AvailabilitySlot[]): number | null {
  const prices = slots.filter((slot) => slot.isAvailable).map((slot) => slot.priceCents)

  return prices.length > 0 ? Math.min(...prices) : null
}

function labelFor(state: SlotState, isOffPeak: boolean): string {
  switch (state) {
    case 'booked':
      return 'Booked'
    case 'selected':
      return 'Your slot starts here'
    case 'included':
      return 'Included in your booking'
    case 'available':
      return isOffPeak ? 'Off-peak rate' : 'Available'
  }
}

/**
 * One row per start time, in the timeline the design shows.
 *
 * Taken slots are kept rather than filtered out — the design greys them in
 * place so the customer can see how busy the day is, not just what is left.
 */
export function buildSlotRows(input: BuildSlotRowsInput): readonly SlotRow[] {
  const selection =
    input.selectedStartsAt === null
      ? null
      : {
          from: input.selectedStartsAt.getTime(),
          to: input.selectedStartsAt.getTime() + input.durationMinutes * 60 * 1000,
        }

  const floor = lowestPriceCents(input.slots)
  const hasPriceSpread =
    floor !== null && input.slots.some((slot) => slot.isAvailable && slot.priceCents > floor)

  return input.slots.map((slot) => {
    const state = stateOf(slot, selection)
    const isOffPeak = hasPriceSpread && slot.priceCents === floor

    return {
      startsAt: slot.startsAt,
      time: formatTimeInZone(slot.startsAt, input.timeZone),
      label: labelFor(state, isOffPeak),
      price: slot.isAvailable ? formatMoney(slot.priceCents, input.currency) : '—',
      state,
      // A slot inside the current booking is already the customer's; only a
      // free row outside it starts a new selection.
      isSelectable: slot.isAvailable && state !== 'included',
    }
  })
}
