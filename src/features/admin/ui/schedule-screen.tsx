'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AdminPageHeader, AdminScreen, CARD, EmptyState, StatCards } from './primitives'
import { BlockTimeForm } from './block-time-form'
import { ScheduleAgenda } from './schedule-agenda'
import { SCHEDULE_TONE_STYLES } from './schedule-tones'
import { useIsDesktop } from './desktop-viewport'
import { buildScheduleAgenda, SCHEDULE_TONE_LABELS } from '../view/schedule-agenda'
import { NOTHING_BOOKED, type ScheduleGrid, type ScheduleTone } from '../view/schedule'
import type { StatCard } from '../view/schedule-stats'
import type { AvailabilityBlock } from '@/lib/repositories/booking-mappers'
import type { Club, Court } from '@/lib/repositories/mappers'
import type { Result } from '@/lib/api/result'

/**
 * The day view of the court schedule.
 *
 * Above `lg` it is a grid: entries positioned as percentages of the column,
 * which the view model has already worked out. Below it the grid cannot be
 * read — a column per court needs 680px before anything is legible, which is a
 * sideways scroll on every device the desk actually carries — so the same day
 * is offered as a list, court by court. That is one of the two places in the
 * console where the layouts are different DOM rather than one restyled, and it
 * chooses from the shared breakpoint so it cannot disagree with the nav.
 *
 * The colour of an entry is never its only meaning: every entry prints its own
 * time range, the grid names each tone in a legend beneath it, and the list,
 * which scrolls away from any legend, names the tone on each entry.
 *
 * The day is chosen with a date input rather than stepped to with arrows: any
 * date is one pick away, and the schedule is server-rendered per day, so ?day=
 * is what actually loads another day's bookings. A staff member can still
 * bookmark or share the date they are looking at, and today stays the bare
 * /admin, so the console's landing page remains canonical.
 */

const ROW_HEIGHT_PX = 58

const LEGEND: readonly ScheduleTone[] = ['confirmed', 'awaiting', 'blocked', 'event']

export interface ScheduleScreenProps {
  /** Club-local calendar day being viewed, "YYYY-MM-DD". */
  readonly day: string
  /** Club-local today, "YYYY-MM-DD" — the day the bare /admin shows. */
  readonly today: string
  readonly dayLabel: string
  readonly club: Club
  readonly courts: readonly Court[]
  readonly grid: ScheduleGrid
  readonly stats: readonly StatCard[]
  readonly onBlock: (payload: unknown) => Promise<Result<AvailabilityBlock>>
  readonly onRelease: (payload: unknown) => Promise<Result<{ blockId: string }>>
}

export function ScheduleScreen({
  day,
  today,
  dayLabel,
  club,
  courts,
  grid,
  stats,
  onBlock,
  onRelease,
}: ScheduleScreenProps) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const agenda = useMemo(() => buildScheduleAgenda(grid), [grid])
  const hasCourts = grid.columns.length > 0

  function handleRelease(blockId: string): void {
    setError(null)

    startTransition(async () => {
      const result = await onRelease({ blockId })

      if (!result.success) {
        setError(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <AdminScreen>
      <AdminPageHeader
        title="Court schedule"
        subtitle={
          isDesktop
            ? `${dayLabel} · bookings and blocked time across every court`
            : 'Bookings and blocked time across every court'
        }
      >
        {/* The picker carries the date on a phone, where the subtitle above it
            is the first thing to scroll away. */}
        <DayNav day={day} today={today} />
      </AdminPageHeader>

      <StatCards stats={stats} />

      {error ? (
        <p role="alert" className="mb-3 text-[13px] font-semibold text-danger">
          {error}
        </p>
      ) : null}

      {!hasCourts ? (
        <div className={CARD}>
          <EmptyState>No active courts to schedule yet.</EmptyState>
        </div>
      ) : isDesktop ? (
        <ScheduleGridView grid={grid} isPending={isPending} onRelease={handleRelease} />
      ) : (
        <ScheduleAgenda sections={agenda} isPending={isPending} onRelease={handleRelease} />
      )}

      {courts.length > 0 ? (
        <BlockTimeSection
          key={day}
          day={day}
          club={club}
          courts={courts}
          isDesktop={isDesktop}
          onBlock={onBlock}
        />
      ) : null}

      {/* The agenda names its own tones, so the legend would be a second copy. */}
      {isDesktop ? (
        <ul
          aria-label="Schedule legend"
          className="mt-3.5 flex list-none flex-wrap gap-4 p-0 text-[12.5px] text-muted"
        >
          {LEGEND.map((tone) => (
            <li key={tone} className="flex items-center gap-2">
              <span aria-hidden className={`size-3 rounded-[3px] ${SCHEDULE_TONE_STYLES[tone]}`} />
              {SCHEDULE_TONE_LABELS[tone]}
            </li>
          ))}
        </ul>
      ) : null}
    </AdminScreen>
  )
}

interface ScheduleGridViewProps {
  readonly grid: ScheduleGrid
  readonly isPending: boolean
  readonly onRelease: (blockId: string) => void
}

/** The desktop layout: one column per court, entries placed by percentage. */
function ScheduleGridView({ grid, isPending, onRelease }: ScheduleGridViewProps) {
  const columnTemplate = `74px repeat(${grid.columns.length}, minmax(150px, 1fr))`
  const bodyHeight = grid.hourLabels.length * ROW_HEIGHT_PX

  return (
    <div className={`${CARD} overflow-x-auto`}>
      <div role="table" aria-label="Court schedule" className="min-w-[680px]">
        <div role="rowgroup">
          <div
            role="row"
            className="grid border-b border-surface-sunken bg-surface-alt"
            style={{ gridTemplateColumns: columnTemplate }}
          >
            <span role="columnheader" className="px-2.5 py-3.5 text-[12px] font-bold text-subtle">
              Time
            </span>
            {grid.columns.map((column) => (
              <span
                key={column.courtId}
                role="columnheader"
                className="border-l border-surface-sunken px-3.5 py-3 text-left"
              >
                <span className="block text-[14.5px] font-bold">{column.courtName}</span>
                <span className="mt-0.5 block text-[12px] font-normal text-subtle">
                  {column.meta}
                </span>
                <span className="mt-0.5 block text-[12px] font-semibold text-olive">
                  {column.openLabel}
                </span>
                {/* Whether anyone has this court, in words: the entries below
                    answer it only if the whole column is read. */}
                <span
                  className={`mt-0.5 block text-[12px] font-semibold ${
                    column.summary === NOTHING_BOOKED ? 'text-subtle' : 'text-ink'
                  }`}
                >
                  {column.summary}
                </span>
              </span>
            ))}
          </div>
        </div>

        <div role="rowgroup">
          <div role="row" className="grid" style={{ gridTemplateColumns: columnTemplate }}>
            <span role="rowheader" className="block">
              {grid.hourLabels.map((label) => (
                <span
                  key={label}
                  className="flex items-start border-b border-[#f2f5f8] px-2.5 pt-1.5 text-[12px] text-subtle tabular-nums"
                  style={{ height: ROW_HEIGHT_PX }}
                >
                  {label}
                </span>
              ))}
            </span>

            {grid.columns.map((column) => (
              <span
                key={column.courtId}
                role="cell"
                className="relative block border-l border-surface-sunken"
                style={{ height: bodyHeight }}
              >
                {/* Hour rules, drawn behind the entries. */}
                <span aria-hidden className="absolute inset-0">
                  {grid.hourLabels.map((label) => (
                    <span
                      key={label}
                      className="block border-b border-[#f2f5f8]"
                      style={{ height: ROW_HEIGHT_PX }}
                    />
                  ))}
                </span>

                {column.entries.map((entry) => (
                  <span
                    key={entry.id}
                    className={`absolute right-1 left-1 overflow-hidden rounded-lg px-2.5 py-1.5 ${SCHEDULE_TONE_STYLES[entry.tone]}`}
                    style={{
                      top: `${entry.topPercent}%`,
                      height: `${entry.heightPercent}%`,
                    }}
                  >
                    <span className="block text-[12.5px] leading-tight font-bold">
                      {entry.title}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] opacity-80">{entry.detail}</span>
                    {entry.blockId ? (
                      <button
                        type="button"
                        aria-label={`Release ${entry.title}`}
                        disabled={isPending}
                        onClick={() => onRelease(entry.blockId as string)}
                        className="mt-1 text-[11.5px] font-semibold underline underline-offset-2 disabled:opacity-55"
                      >
                        Release
                      </button>
                    ) : null}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface BlockTimeSectionProps {
  readonly day: string
  readonly club: Club
  readonly courts: readonly Court[]
  readonly isDesktop: boolean
  readonly onBlock: ScheduleScreenProps['onBlock']
}

/**
 * Six fields under the day is most of a phone screen spent on something the
 * desk does occasionally, so on a phone the form waits to be asked for. On a
 * desktop it sits open under the grid, where the decision to block is made.
 */
function BlockTimeSection({ day, club, courts, isDesktop, onBlock }: BlockTimeSectionProps) {
  const [isOpen, setIsOpen] = useState(false)

  if (isDesktop) {
    return <BlockTimeForm day={day} club={club} courts={courts} onBlock={onBlock} />
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex h-12 w-full items-center justify-between rounded-[14px] border border-line bg-surface px-4 text-[14.5px] font-semibold text-ink"
      >
        Block court time
        <span aria-hidden className="text-[18px] text-subtle">
          {isOpen ? '−' : '+'}
        </span>
      </button>

      {isOpen ? <BlockTimeForm day={day} club={club} courts={courts} onBlock={onBlock} /> : null}
    </div>
  )
}

const DAY_INPUT =
  'h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[13.5px] font-semibold ' +
  'tabular-nums text-ink focus-visible:outline-2 focus-visible:outline-offset-1 ' +
  'focus-visible:outline-navy-mid sm:h-10 sm:w-auto sm:text-[13px]'

/**
 * The day being viewed, as the date input the desk already knows how to use.
 * Picking a date loads that day's schedule; picking today drops the ?day= param
 * so the console's landing page stays canonical.
 *
 * The field holds the picked date itself rather than the loaded one, for the
 * seconds the server takes: a controlled-by-props input would snap back to the
 * previous day the instant the desk picked a new one, which reads as a dropped
 * tap. The loaded day overrides it as soon as it arrives, and the busy style
 * plus the announced line say plainly that the console is working.
 */
function DayNav({ day, today }: { readonly day: string; readonly today: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [picked, setPicked] = useState(day)
  const [loaded, setLoaded] = useState(day)

  if (day !== loaded) {
    setLoaded(day)
    setPicked(day)
  }

  return (
    <nav aria-label="Schedule day" aria-busy={isPending} className="flex items-center gap-2">
      <input
        type="date"
        aria-label="Schedule date"
        value={picked}
        onChange={(event) => {
          const next = event.target.value

          if (!next) {
            return
          }

          setPicked(next)
          startTransition(() => {
            router.push(next === today ? '/admin' : `/admin?day=${next}`)
          })
        }}
        className={`${DAY_INPUT} ${isPending ? 'opacity-60' : ''}`}
      />

      {/* Announced rather than only shown: a slow day is not a silent one. */}
      <span role="status" aria-live="polite" className="text-[12.5px] font-medium text-muted">
        {isPending ? 'Loading…' : ''}
      </span>
    </nav>
  )
}
