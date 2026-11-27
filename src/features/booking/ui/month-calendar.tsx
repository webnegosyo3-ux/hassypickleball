import Link from 'next/link'
import { isDayBookable, type MonthDay, type MonthWeek } from '../view/month-calendar'

/**
 * A month, as a calendar a customer can read at a glance.
 *
 * Every cell answers one question — is there anything left that day — and the
 * cell that cannot be booked is a plain <span> rather than a link, so the
 * calendar never offers a tap that goes nowhere. Booking is a form later in the
 * flow; this only decides which day to open.
 *
 * It is a Server Component on purpose: the whole calendar is links, so it costs
 * no client JavaScript and every day is shareable and openable in a new tab.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** "Sat 27 Sep" — the accessible name needs a date, not a bare number. */
function dayLabel(day: MonthDay, timeZone: string): string {
  const date = new Date(`${day.day}T12:00:00Z`)

  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date)
}

function cellState(day: MonthDay): { readonly text: string; readonly tone: string } {
  if (day.isPast) {
    return { text: '—', tone: 'text-subtle' }
  }

  if (day.openSlots === null) {
    return { text: '', tone: 'text-subtle' }
  }

  if (day.openSlots === 0) {
    return { text: 'Full', tone: 'text-muted' }
  }

  return { text: `${day.openSlots} free`, tone: 'text-olive' }
}

export type MonthCalendarProps = {
  readonly label: string
  readonly weeks: readonly MonthWeek[]
  readonly timeZone: string
  readonly hrefFor: (day: string) => string
  readonly previousHref: string | null
  readonly nextHref: string | null
}

export function MonthCalendar({
  label,
  weeks,
  timeZone,
  hrefFor,
  previousHref,
  nextHref,
}: MonthCalendarProps) {
  return (
    <section
      aria-label={`Availability calendar for ${label}`}
      className="rounded-[18px] border border-line bg-surface p-4 sm:p-5"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        {previousHref ? (
          <Link
            href={previousHref}
            aria-label="Previous month"
            className="flex size-10 items-center justify-center rounded-[10px] border border-line text-slate hover:border-line-heavy"
          >
            ‹
          </Link>
        ) : (
          <span aria-hidden className="size-10" />
        )}

        <h2 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-bold tracking-[-0.02em] sm:text-[19px]">
          {label}
        </h2>

        {nextHref ? (
          <Link
            href={nextHref}
            aria-label="Next month"
            className="flex size-10 items-center justify-center rounded-[10px] border border-line text-slate hover:border-line-heavy"
          >
            ›
          </Link>
        ) : (
          <span aria-hidden className="size-10" />
        )}
      </div>

      <div aria-hidden className="mb-1.5 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((weekday) => (
          <span
            key={weekday}
            className="text-center text-[10.5px] font-bold uppercase tracking-[0.08em] text-subtle"
          >
            {weekday}
          </span>
        ))}
      </div>

      <div className="grid gap-1">
        {weeks.map((week, index) => (
          <div key={index} className="grid grid-cols-7 gap-1">
            {week.map((day, position) =>
              day === null ? (
                <span key={`blank-${position}`} aria-hidden />
              ) : isDayBookable(day) ? (
                <Link
                  key={day.day}
                  href={hrefFor(day.day)}
                  aria-current={day.isSelected ? 'date' : undefined}
                  aria-label={`${dayLabel(day, timeZone)}, ${
                    day.openSlots === null ? 'times available' : `${day.openSlots} slots free`
                  }`}
                  className={`flex min-h-[58px] flex-col items-center justify-center rounded-[10px] border px-0.5 py-1.5 text-center transition ${
                    day.isSelected
                      ? 'border-navy bg-navy text-white'
                      : 'border-line bg-surface text-ink hover:border-navy-mid hover:text-navy-mid'
                  }`}
                >
                  <span className="text-[14px] font-bold leading-none">{day.dayOfMonth}</span>
                  <span
                    className={`mt-1 text-[10px] font-semibold leading-none ${
                      day.isSelected ? 'text-lime' : cellState(day).tone
                    }`}
                  >
                    {cellState(day).text}
                  </span>
                </Link>
              ) : (
                <span
                  key={day.day}
                  aria-label={`${dayLabel(day, timeZone)}, ${day.isPast ? 'past' : 'fully booked'}`}
                  className="flex min-h-[58px] flex-col items-center justify-center rounded-[10px] border border-line bg-canvas px-0.5 py-1.5 text-center opacity-55"
                >
                  <span className="text-[14px] font-bold leading-none text-muted">
                    {day.dayOfMonth}
                  </span>
                  <span
                    className={`mt-1 text-[10px] font-semibold leading-none ${cellState(day).tone}`}
                  >
                    {cellState(day).text}
                  </span>
                </span>
              ),
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
