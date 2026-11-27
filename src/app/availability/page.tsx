import Link from 'next/link'
import { getAvailability } from '@/features/booking/server/availability'
import { getMonthOpenSlots } from '@/features/booking/server/month-availability'
import { MonthCalendar } from '@/features/booking/ui/month-calendar'
import { buildSlotRows, parseDurationMinutes } from '@/features/booking/view/court-detail'
import {
  buildMonthCalendar,
  describeMonth,
  monthOf,
  shiftMonth,
} from '@/features/booking/view/month-calendar'
import { loadCatalog } from '@/features/courts/catalog'
import { parseDayString, toDayStringInZone } from '@/lib/format/time'
import type { SlotRow } from '@/features/booking/view/court-detail'

const CLUB_SLUG = 'baseline'

type AvailabilityPageProps = {
  searchParams: Promise<{ day?: string; duration?: string; month?: string }>
}

const MONTH_PATTERN = /^\d{4}-\d{2}$/

/** A day, opening at the selected one and never before today. */
function resolveMonth(raw: string | undefined, day: string): string {
  return raw !== undefined && MONTH_PATTERN.test(raw) ? raw : monthOf(day)
}

/**
 * The availability calendar: what is taken and what is still open, for every
 * court, before anybody fills in a form.
 *
 * This is the page behind the header's "See availability". It answers the
 * question a customer actually asks first — "is there anything on Saturday?" —
 * and each free time is a link that opens the court page with that slot already
 * selected, so choosing and booking never disagree about what is open.
 *
 * Slots are read for the whole day in one call and priced the same way the
 * court page prices them; a time shown as open here is the time the form will
 * offer.
 */
export default async function AvailabilityPage({ searchParams }: AvailabilityPageProps) {
  const [catalog, query] = await Promise.all([loadCatalog(CLUB_SLUG), searchParams])

  if (!catalog) {
    return (
      <main className="mx-auto w-full max-w-[720px] px-4 py-16 text-center">
        <h1 className="font-[family-name:var(--font-display)] text-[28px] font-bold">
          Availability is unavailable
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          The club&apos;s schedule could not be read right now. Please try again in a moment.
        </p>
      </main>
    )
  }

  const { club, courts } = catalog
  const today = toDayStringInZone(new Date(), club.timeZone)
  const day = parseDayString(query.day, today)
  const durationMinutes = parseDurationMinutes({ raw: query.duration, club })
  const month = resolveMonth(query.month, day)

  const [monthResult, dayResult] = await Promise.all([
    getMonthOpenSlots({ club, courts, month, durationMinutes }),
    getAvailability({ clubId: club.id, day, durationMinutes }),
  ])

  const openByDay = monthResult.success ? monthResult.data : {}
  const weeks = buildMonthCalendar({
    month,
    timeZone: club.timeZone,
    today,
    selectedDay: day,
    openByDay,
  })
  const grid = describeMonth(month, club.timeZone)

  // One link shape for every control on the page, so the day, the month and the
  // session length always travel together instead of resetting each other.
  function hrefFor(next: {
    readonly day?: string
    readonly month?: string
    readonly duration?: number
  }) {
    const params = new URLSearchParams({
      day: next.day ?? day,
      duration: String(next.duration ?? durationMinutes),
      month: next.month ?? monthOf(next.day ?? day),
    })

    return `/availability?${params.toString()}`
  }

  const durations = [30, 60, 90, 120].filter(
    (minutes) => minutes >= club.minDurationMinutes && minutes <= club.maxDurationMinutes,
  )

  const byId = new Map(courts.map((court) => [court.id, court]))

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pb-20 pt-6 sm:px-7">
      <header className="mb-6 text-center">
        <h1 className="mb-2.5 font-[family-name:var(--font-display)] text-[30px] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[40px]">
          Availability
        </h1>
        <p className="mx-auto max-w-[54ch] text-pretty text-[16px] text-muted">
          Pick a day, then a time that is still open. Times already taken are marked, so you only
          choose from what is really free.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
        <span className="text-[13px] font-medium text-muted">Session length</span>
        {durations.map((minutes) => (
          <Link
            key={minutes}
            href={hrefFor({ duration: minutes })}
            aria-current={minutes === durationMinutes ? 'page' : undefined}
            className={`flex min-h-[44px] items-center rounded-[9px] border px-3.5 text-[13.5px] font-semibold ${
              minutes === durationMinutes
                ? 'border-navy bg-navy text-white'
                : 'border-line bg-surface text-slate hover:border-line-heavy'
            }`}
          >
            {minutes} min
          </Link>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-24">
          <MonthCalendar
            label={grid.label}
            weeks={weeks}
            timeZone={club.timeZone}
            hrefFor={(nextDay) => hrefFor({ day: nextDay })}
            previousHref={month > monthOf(today) ? hrefFor({ month: shiftMonth(month, -1) }) : null}
            nextHref={hrefFor({ month: shiftMonth(month, 1) })}
          />
        </div>

        <div className="flex flex-col gap-4">
          {dayResult.success ? null : (
            <p
              role="alert"
              className="rounded-[12px] border border-danger-line bg-danger-bg px-4 py-3 text-[14px] text-danger"
            >
              {dayResult.error}
            </p>
          )}

          {dayResult.success &&
            dayResult.data.map((courtDay) => {
              const court = byId.get(courtDay.courtId)
              const rows = buildSlotRows({
                slots: courtDay.slots,
                selectedStartsAt: null,
                durationMinutes,
                timeZone: club.timeZone,
                currency: club.currency,
              })

              return (
                <section
                  key={courtDay.courtId}
                  aria-label={`${courtDay.courtName} availability`}
                  className="rounded-[18px] border border-line bg-surface p-4 sm:p-5"
                >
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="m-0 font-[family-name:var(--font-display)] text-[17px] font-bold tracking-[-0.02em]">
                      {courtDay.courtName}
                    </h2>
                    <p className="m-0 text-[13px] font-semibold text-olive">
                      {courtDay.openCount === 0
                        ? 'Full for this length'
                        : `${courtDay.openCount} open`}
                    </p>
                  </div>

                  <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                    {rows.map((row) => (
                      <li key={row.startsAt.toISOString()}>
                        <SlotCell
                          row={row}
                          href={
                            court && row.isSelectable
                              ? `/courts/${court.slug}?day=${day}&duration=${durationMinutes}&at=${encodeURIComponent(row.startsAt.toISOString())}`
                              : null
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}

          {dayResult.success && dayResult.data.length === 0 ? (
            <p className="rounded-[14px] border border-line bg-surface px-5 py-8 text-center text-muted">
              No courts are published yet.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}

type SlotCellProps = {
  readonly row: SlotRow
  /** Null when the time cannot be booked — taken, blocked or already past. */
  readonly href: string | null
}

/**
 * One start time. A free slot is a link into the booking form; the rest are
 * text, marked with why they cannot be picked so the day reads honestly.
 */
function SlotCell({ row, href }: SlotCellProps) {
  if (href === null) {
    return (
      <span
        className="flex min-h-[46px] flex-col items-center justify-center rounded-[10px] border border-line bg-surface-sunken px-2 py-1.5 text-center text-subtle"
        aria-label={`${row.time}, ${row.label}`}
      >
        <span className="text-[13.5px] font-semibold leading-none line-through decoration-1">
          {row.time}
        </span>
        <span className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.06em]">
          {row.label}
        </span>
      </span>
    )
  }

  return (
    <Link
      href={href}
      aria-label={`${row.time}, available, ${row.price}`}
      className="flex min-h-[46px] flex-col items-center justify-center rounded-[10px] border border-lime-deep bg-lime-soft px-2 py-1.5 text-center text-navy transition hover:border-navy hover:bg-lime"
    >
      <span className="text-[13.5px] font-bold leading-none">{row.time}</span>
      <span className="mt-1 text-[10.5px] font-bold uppercase tracking-[0.06em]">{row.price}</span>
    </Link>
  )
}
