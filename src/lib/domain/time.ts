import type { TimeRange } from './types'

const MINUTES_PER_HOUR = 60
const MS_PER_MINUTE = 60_000
const MINUTES_PER_DAY = 1440
const CLOCK_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/
const DAY_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/
/** "YYYY-MM-DD" — the slice of an ISO string that is the calendar day. */
const DAY_STRING_LENGTH = 10

/** Sunday = 0, matching the Postgres `dow` convention used by pricing_rules. */
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

export type ZonedParts = {
  readonly dayOfWeek: number
  readonly minutesOfDay: number
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MS_PER_MINUTE)
}

export function durationMinutes(range: TimeRange): number {
  return (range.endsAt.getTime() - range.startsAt.getTime()) / MS_PER_MINUTE
}

/** Half-open comparison: ranges that merely touch do not overlap. */
export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt
}

/** Parses "HH:MM" or "HH:MM:SS" into minutes since midnight. */
export function parseClockTime(value: string): number {
  const match = CLOCK_TIME_PATTERN.exec(value)

  if (!match) {
    throw new Error(`Invalid clock time: ${value}`)
  }

  const hours = Number(match[1])
  const minutes = Number(match[2])

  // 24:00 (and 24:00:00) is the ISO 8601 end-of-day sentinel: midnight at the
  // close of the current day, i.e. exactly MINUTES_PER_DAY (1440) minutes
  // since midnight. Databases such as Postgres store closing times this way
  // when a venue closes at midnight, so we must accept it here.
  if (hours === 24 && minutes === 0) {
    return MINUTES_PER_DAY
  }

  if (hours > 23 || minutes > 59) {
    throw new Error(`Invalid clock time: ${value}`)
  }

  return hours * MINUTES_PER_HOUR + minutes
}

/**
 * The calendar day `days` away from `day`, as "YYYY-MM-DD".
 *
 * Arithmetic is done in UTC on purpose: a calendar day is a label here, not an
 * instant, so no timezone can shorten or lengthen the step. That keeps the
 * schedule's previous/next controls landing on consecutive days even in a zone
 * whose local midnight moves for daylight saving.
 */
export function shiftDayString(day: string, days: number): string {
  if (!DAY_STRING_PATTERN.test(day)) {
    throw new Error(`Invalid day: ${day}`)
  }

  const [year, month, date] = day.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, date + days))

  return shifted.toISOString().slice(0, DAY_STRING_LENGTH)
}

/**
 * Club-local day of week and minute of day for an instant. Uses Intl so DST
 * transitions are handled by the platform's tz database rather than by us.
 */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''

  return {
    dayOfWeek: WEEKDAY_INDEX[lookup('weekday')] ?? 0,
    minutesOfDay: Number(lookup('hour')) * MINUTES_PER_HOUR + Number(lookup('minute')),
  }
}

/**
 * Resolves a club-local wall-clock time on a calendar day to a UTC instant.
 *
 * Done by guessing UTC, measuring the zone offset actually in force at that
 * guess, and correcting — the standard two-pass approach, which lands on the
 * right side of a DST boundary without pulling in a date library.
 */
export function zonedTimeToUtc(day: string, minutesOfDay: number, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  const guess = Date.UTC(
    year,
    month - 1,
    date,
    Math.floor(minutesOfDay / MINUTES_PER_HOUR),
    minutesOfDay % MINUTES_PER_HOUR,
  )

  const offsetMs = zoneOffsetMs(new Date(guess), timeZone)
  const corrected = guess - offsetMs

  // Re-measure: near a DST edge the first offset can belong to the wrong side.
  const settledOffsetMs = zoneOffsetMs(new Date(corrected), timeZone)

  return new Date(guess - settledOffsetMs)
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })

  const parts = formatter.formatToParts(date)
  const lookup = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  const asUtc = Date.UTC(
    lookup('year'),
    lookup('month') - 1,
    lookup('day'),
    lookup('hour'),
    lookup('minute'),
    lookup('second'),
  )

  return asUtc - date.getTime()
}

export type EnumerateStartTimesInput = {
  /** Club-local calendar day, "YYYY-MM-DD". */
  readonly day: string
  readonly timeZone: string
  readonly opensAt: string
  readonly closesAt: string
  readonly slotMinutes: number
  readonly durationMinutes: number
}

/**
 * Every club-local start time on `day` at which a session of `durationMinutes`
 * still finishes by closing time. Returned as UTC instants.
 */
export function enumerateStartTimes(input: EnumerateStartTimesInput): Date[] {
  if (input.slotMinutes <= 0) {
    throw new Error('slotMinutes must be greater than 0')
  }

  if (input.durationMinutes <= 0) {
    throw new Error('durationMinutes must be greater than 0')
  }

  const opensAt = parseClockTime(input.opensAt)
  const closesAt = parseClockTime(input.closesAt)
  const lastStart = closesAt - input.durationMinutes

  const starts: Date[] = []
  for (let minute = opensAt; minute <= lastStart; minute += input.slotMinutes) {
    starts.push(zonedTimeToUtc(input.day, minute, input.timeZone))
  }

  return starts
}

export { MINUTES_PER_DAY, MINUTES_PER_HOUR }
