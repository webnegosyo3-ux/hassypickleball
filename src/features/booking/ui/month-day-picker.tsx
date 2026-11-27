'use client'

import { buildMonthCalendar, describeMonth, monthOf, shiftMonth } from '../view/month-calendar'

/**
 * The month grid inside the booking form.
 *
 * A day shows two facts at once: whether it is still bookable, and roughly how
 * much is left. Both come from the server's own slot builder, so a day badged
 * "full" is a day whose times will all be struck through once picked.
 *
 * Days are buttons, not links: the form keeps everything the customer has typed
 * while the calendar moves, so nothing here may navigate.
 */

export type MonthDayPickerProps = {
  /** "YYYY-MM" on show. */
  readonly month: string
  readonly timeZone: string
  /** Club-local today, "YYYY-MM-DD" — the past is shown, never offered. */
  readonly today: string
  readonly selectedDay: string
  /** Open start times keyed by day. Missing days are unknown, not empty. */
  readonly openByDay: Readonly<Record<string, number>>
  readonly isBusy: boolean
  readonly onSelect: (day: string) => void
  readonly onMonthChange: (month: string) => void
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

const ARROW =
  'flex h-9 w-9 flex-none items-center justify-center rounded-[9px] border border-line ' +
  'bg-surface text-[16px] text-slate hover:border-line-heavy disabled:cursor-not-allowed ' +
  'disabled:border-line disabled:text-subtle'

function badgeFor(openSlots: number | null, isPast: boolean): string {
  if (isPast) {
    return '—'
  }

  if (openSlots === null) {
    return ''
  }

  return openSlots === 0 ? 'Full' : `${openSlots} free`
}

export function MonthDayPicker({
  month,
  timeZone,
  today,
  selectedDay,
  openByDay,
  isBusy,
  onSelect,
  onMonthChange,
}: MonthDayPickerProps) {
  const grid = describeMonth(month, timeZone)
  const weeks = buildMonthCalendar({ month, timeZone, today, selectedDay, openByDay })
  // The past months are not on offer: there is nothing behind today to book.
  const canGoBack = month > monthOf(today)

  return (
    <div className="rounded-[14px] border border-line bg-surface-sunken/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous month"
          disabled={!canGoBack || isBusy}
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          className={ARROW}
        >
          ‹
        </button>

        <p aria-live="polite" className="m-0 text-center text-[13.5px] font-bold">
          {grid.label}
        </p>

        <button
          type="button"
          aria-label="Next month"
          disabled={isBusy}
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          className={ARROW}
        >
          ›
        </button>
      </div>

      <div aria-hidden className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((label, index) => (
          <span
            key={`${label}-${index}`}
            className="text-center text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted"
          >
            {label}
          </span>
        ))}
      </div>

      <div role="group" aria-label="Booking day" className="mt-1 grid grid-cols-7 gap-1">
        {weeks.flat().map((cell, index) => {
          if (cell === null) {
            return <span key={`blank-${index}`} aria-hidden />
          }

          const isFull = cell.openSlots === 0
          const isDisabled = cell.isPast || isFull
          const badge = badgeFor(cell.openSlots, cell.isPast)

          return (
            <button
              key={cell.day}
              type="button"
              disabled={isDisabled}
              aria-pressed={cell.isSelected}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-label={`${cell.day}, ${cell.isPast ? 'in the past' : isFull ? 'fully booked' : badge || 'availability unknown'}`}
              onClick={() => onSelect(cell.day)}
              className={`flex min-h-[52px] flex-col items-center justify-center rounded-[9px] border px-0.5 py-1 text-center transition ${
                cell.isSelected
                  ? 'border-navy bg-navy text-white'
                  : isDisabled
                    ? 'border-line bg-surface-sunken text-subtle'
                    : 'border-lime-deep bg-lime-soft text-navy hover:border-navy hover:bg-lime'
              }`}
            >
              <span
                className={`text-[13.5px] font-bold leading-none ${
                  isFull && !cell.isSelected ? 'line-through decoration-1' : ''
                }`}
              >
                {cell.dayOfMonth}
              </span>
              <span className="mt-1 block text-[9px] font-bold uppercase leading-none tracking-[0.02em] opacity-80">
                <span className="sm:hidden">{cell.isPast ? '—' : isFull ? 'Full' : 'free'}</span>
                <span className="hidden sm:block">{badge}</span>
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-2 text-center text-[11px] text-muted">
        Green days still have times free. Days in grey are booked out or behind us.
      </p>
    </div>
  )
}
