import { shiftDayString } from '@/lib/domain/time'

/**
 * The month calendar's read model.
 *
 * A customer deciding when to play needs two facts about a day: whether it is
 * still bookable at all, and whether anything is left. This turns the day list
 * and the open-slot counts into the exact grid the calendar draws — including
 * the blank cells before the first of the month — so the component maps data
 * and never does date arithmetic of its own.
 */

/** How many days the month has, and which weekday it starts on. */
export type MonthGrid = {
  /** "YYYY-MM". */
  readonly month: string
  /** "September 2026", for the heading. */
  readonly label: string
  /** Inclusive first and last day of the month, "YYYY-MM-DD". */
  readonly firstDay: string
  readonly lastDay: string
}

export function describeMonth(month: string, timeZone: string): MonthGrid {
  const firstDay = `${month}-01`
  const start = new Date(`${firstDay}T12:00:00Z`)
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0, 12))

  return {
    month,
    label: new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'long',
      year: 'numeric',
    }).format(start),
    firstDay,
    lastDay: last.toISOString().slice(0, 10),
  }
}

export type MonthDay = {
  /** Club-local calendar day, "YYYY-MM-DD". */
  readonly day: string
  readonly dayOfMonth: string
  readonly isToday: boolean
  readonly isSelected: boolean
  /** Before the club's today: shown, never offered. */
  readonly isPast: boolean
  /**
   * Start times still free that day, or null when the count is unknown (the
   * read failed, or the day is outside the loaded month).
   */
  readonly openSlots: number | null
}

/** One calendar row. Leading and trailing blanks are null. */
export type MonthWeek = readonly (MonthDay | null)[]

export type BuildMonthCalendarInput = {
  readonly month: string
  readonly timeZone: string
  /** Club-local today, "YYYY-MM-DD". */
  readonly today: string
  readonly selectedDay: string
  /** Open start times keyed by day. Missing days are reported as unknown. */
  readonly openByDay?: Readonly<Record<string, number>>
}

/** Weeks start on Sunday, matching the club's own printed schedule. */
const WEEK_LENGTH = 7

export function buildMonthCalendar(input: BuildMonthCalendarInput): readonly MonthWeek[] {
  const grid = describeMonth(input.month, input.timeZone)
  const start = new Date(`${grid.firstDay}T12:00:00Z`)
  const leadingBlanks = start.getUTCDay()
  const dayCount = Number(grid.lastDay.slice(8, 10))

  const cells: (MonthDay | null)[] = Array.from({ length: leadingBlanks }, () => null)

  for (let index = 0; index < dayCount; index += 1) {
    const day = index === 0 ? grid.firstDay : shiftDayString(grid.firstDay, index)
    const open = input.openByDay?.[day]

    cells.push({
      day,
      dayOfMonth: String(index + 1),
      isToday: day === input.today,
      isSelected: day === input.selectedDay,
      isPast: day < input.today,
      openSlots: open ?? null,
    })
  }

  // Pad the final row so every week renders the same number of cells.
  while (cells.length % WEEK_LENGTH !== 0) {
    cells.push(null)
  }

  return Array.from({ length: cells.length / WEEK_LENGTH }, (_unused, week) =>
    cells.slice(week * WEEK_LENGTH, week * WEEK_LENGTH + WEEK_LENGTH),
  )
}

/** "2026-09" from any day string, and the month either side of it. */
export function monthOf(day: string): string {
  return day.slice(0, 7)
}

export function shiftMonth(month: string, months: number): string {
  const start = new Date(`${month}-01T12:00:00Z`)
  const shifted = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1, 12))

  return shifted.toISOString().slice(0, 7)
}

/**
 * Whether a day is worth offering at all.
 *
 * A day with no slots left, or one already behind us, renders as a disabled
 * cell rather than a link — tapping into an empty day is a dead end.
 */
export function isDayBookable(day: MonthDay): boolean {
  if (day.isPast) {
    return false
  }

  return day.openSlots === null || day.openSlots > 0
}
