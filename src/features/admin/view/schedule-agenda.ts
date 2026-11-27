import type { ScheduleColumn, ScheduleEntry, ScheduleGrid, ScheduleTone } from './schedule'

/**
 * The day read as a list rather than as a grid.
 *
 * A column per court needs horizontal room a phone does not have — the grid
 * asks for 680px before it can be read at all, which is a sideways scroll on
 * every device the desk actually carries. The same day is offered here court by
 * court, in the order the day runs.
 *
 * The geometry is dropped on the way in: a list has no percentages, only
 * sequence. What it gains instead is wording. The grid could lean on colour
 * because its legend sat directly underneath, and a list scrolls away from any
 * legend, so each entry says what it is.
 */

export const SCHEDULE_TONE_LABELS: Record<ScheduleTone, string> = {
  confirmed: 'Confirmed',
  awaiting: 'Awaiting payment',
  blocked: 'Maintenance or blocked',
  event: 'League or event',
}

export type ScheduleAgendaEntry = {
  readonly id: string
  readonly title: string
  /** "5:00 PM – 6:30 PM". */
  readonly detail: string
  readonly tone: ScheduleTone
  /** The tone in words, so nothing on the list is carried by colour alone. */
  readonly toneLabel: string
  /** Set only on staff-created holds, which are the only entries releasable here. */
  readonly blockId: string | null
}

export type ScheduleAgendaSection = {
  readonly courtId: string
  readonly courtName: string
  /** "Indoor · ₱600/hr" — the same sub-label the grid column carries. */
  readonly meta: string
  /** "12.5 hrs open", or "Fully booked". */
  readonly openLabel: string
  /** "2 bookings · 1 hold", or "Nothing booked". */
  readonly summary: string
  readonly entries: readonly ScheduleAgendaEntry[]
}

function toAgendaEntry(entry: ScheduleEntry): ScheduleAgendaEntry {
  return {
    id: entry.id,
    title: entry.title,
    detail: entry.detail,
    tone: entry.tone,
    toneLabel: SCHEDULE_TONE_LABELS[entry.tone],
    blockId: entry.blockId,
  }
}

function toSection(column: ScheduleColumn): ScheduleAgendaSection {
  return {
    courtId: column.courtId,
    courtName: column.courtName,
    meta: column.meta,
    openLabel: column.openLabel,
    // The grid header carries the same count, so it is worked out once, in the
    // view model that both layouts read.
    summary: column.summary,
    entries: column.entries.map(toAgendaEntry),
  }
}

export function buildScheduleAgenda(grid: ScheduleGrid): readonly ScheduleAgendaSection[] {
  return grid.columns.map(toSection)
}
