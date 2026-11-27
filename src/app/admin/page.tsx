import { dayWindow, loadConsole, todayWindow } from './console-data'
import { ScheduleScreen } from '@/features/admin/ui/schedule-screen'
import { blockCourtTimeAction, removeCourtBlockAction } from '@/features/admin/actions'
import { buildScheduleGrid } from '@/features/admin/view/schedule'
import { buildScheduleStats } from '@/features/admin/view/schedule-stats'
import { formatDayInZone, parseDayString } from '@/lib/format/time'
import { listBlocksInWindow } from '@/lib/repositories/blocks'
import { listBookingsInWindow } from '@/lib/repositories/bookings'
import { listActiveCourts } from '@/lib/repositories/courts'

/**
 * The console lands on today's schedule — the screen the desk lives in.
 *
 * `?day=` moves it to any other date. The param is normalised rather than
 * trusted: an unparseable day would otherwise reach the window arithmetic and
 * render a grid of Invalid Dates.
 */
export default async function AdminSchedulePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { client, club } = await loadConsole()
  const today = todayWindow(club)

  const requested = (await searchParams).day
  const day = parseDayString(typeof requested === 'string' ? requested : undefined, today.day)
  const window = dayWindow(club, day)

  const courts = await listActiveCourts(client, club.id)

  const [bookings, blocks] = await Promise.all([
    listBookingsInWindow(client, { clubId: club.id, from: window.from, to: window.to }),
    listBlocksInWindow(client, {
      courtIds: courts.map((court) => court.id),
      from: window.from,
      to: window.to,
    }),
  ])

  return (
    <ScheduleScreen
      day={window.day}
      today={today.day}
      dayLabel={formatDayInZone(window.from, club.timeZone)}
      club={club}
      courts={courts}
      grid={buildScheduleGrid({ club, courts, bookings, blocks, day: window.day })}
      stats={buildScheduleStats({ club, courts, bookings, day: window.day })}
      onBlock={blockCourtTimeAction}
      onRelease={removeCourtBlockAction}
    />
  )
}
