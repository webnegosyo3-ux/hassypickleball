import 'server-only'

import { findOpenStartTimes, mergeBusyRanges } from '@/lib/domain/availability'
import { enumerateStartTimes, openWindowMinutes, zonedTimeToUtc } from '@/lib/domain/time'
import { findBusyRangesByCourt, findBusyRangesByCourtPublic } from '@/lib/repositories/availability'
import { availabilityAccess } from './access'
import type { Club } from '@/lib/repositories/mappers'

/**
 * How many start times are still free on a day, per court.
 *
 * Split out from getAvailability because the catalog needs only the count. The
 * full read model prices every slot on every court, and re-reads the club, the
 * court list, and the pricing rules the catalog page already holds — work the
 * storefront would otherwise pay for on every render to display one number.
 *
 * Reads what is taken the same way the rest of the storefront does: the tables
 * when a service-role key is configured, `court_day_busy` when it is not. The
 * count has to reflect every booking, including the ones RLS hides from anon,
 * and nothing customer-identifying leaves this function — only numbers.
 */

export type CountOpenSlotsInput = {
  readonly club: Club
  readonly courtIds: readonly string[]
  /** Club-local calendar day, "YYYY-MM-DD". */
  readonly day: string
}

/** Open start times keyed by court id. */
export type OpenSlotCounts = Readonly<Record<string, number>>

/**
 * Returns undefined when the read fails. The catalog still renders, just
 * without the counts — a wrong "fully booked" would cost a booking, so an
 * unknown count is left unsaid rather than guessed.
 */
export async function countOpenSlots({
  club,
  courtIds,
  day,
}: CountOpenSlotsInput): Promise<OpenSlotCounts | undefined> {
  if (courtIds.length === 0) {
    return {}
  }

  // Counted at the club's shortest bookable session, which is the most
  // openings a court can offer.
  const durationMinutes = club.minDurationMinutes

  try {
    // The busy window is the club-local calendar day, not a UTC day — in
    // Asia/Manila those differ by eight hours — and it runs on to closing time,
    // which is past midnight for a club that closes at 01:00.
    const from = zonedTimeToUtc(day, 0, club.timeZone)
    const to = zonedTimeToUtc(
      day,
      openWindowMinutes(club.opensAt, club.closesAt).closesAt,
      club.timeZone,
    )

    const { client, privileged } = await availabilityAccess()

    const busyByCourt = privileged
      ? await findBusyRangesByCourt(client, { courtIds: [...courtIds], from, to })
      : await findBusyRangesByCourtPublic(client, { clubId: club.id, from, to })

    const candidates = enumerateStartTimes({
      day,
      timeZone: club.timeZone,
      opensAt: club.opensAt,
      closesAt: club.closesAt,
      slotMinutes: club.slotMinutes,
      durationMinutes,
    })

    return Object.fromEntries(
      courtIds.map((courtId) => [
        courtId,
        findOpenStartTimes({
          candidates,
          durationMinutes,
          busy: mergeBusyRanges(busyByCourt[courtId] ?? []),
        }).length,
      ]),
    )
  } catch {
    return undefined
  }
}
