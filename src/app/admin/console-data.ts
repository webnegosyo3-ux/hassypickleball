import 'server-only'

import { cache } from 'react'
import { notFound } from 'next/navigation'
import { zonedTimeToUtc } from '@/lib/domain/time'
import { toDayStringInZone } from '@/lib/format/time'
import { getStaffAccess, type StaffMember } from '@/lib/auth/staff'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Client } from '@/lib/repositories/support'
import type { Club } from '@/lib/repositories/mappers'

/**
 * The context every admin page starts from.
 *
 * The layout has already redirected anyone without a staff record, so reaching
 * here without one means the session ended mid-navigation; that is a 404 rather
 * than a crash. Reads use the anon-key server client so RLS stays the boundary
 * — the staff policies are what actually decide what these screens can see.
 *
 * The club comes back with the staff record (see getStaffAccess), so this costs
 * no query of its own. Cached per request for the same reason: a page and the
 * components under it ask once between them.
 */

export type AdminConsole = {
  readonly staff: StaffMember
  readonly client: Client
  readonly club: Club
}

export const loadConsole = cache(async (): Promise<AdminConsole> => {
  const access = await getStaffAccess()

  if (access.status !== 'staff') {
    notFound()
  }

  const client = (await createSupabaseServerClient()) as unknown as Client

  return { staff: access.staff, client, club: access.club }
})

export type DayWindow = {
  /** Club-local calendar day, "YYYY-MM-DD". */
  readonly day: string
  readonly from: Date
  readonly to: Date
  readonly days: number
}

const MINUTES_PER_DAY = 1440

/** A named club-local day, as a UTC half-open interval. */
export function dayWindow(club: Club, day: string): DayWindow {
  return {
    day,
    from: zonedTimeToUtc(day, 0, club.timeZone),
    to: zonedTimeToUtc(day, MINUTES_PER_DAY, club.timeZone),
    days: 1,
  }
}

/** The club-local day containing `now`, as a UTC half-open interval. */
export function todayWindow(club: Club, now: Date = new Date()): DayWindow {
  return dayWindow(club, toDayStringInZone(now, club.timeZone))
}

/** The `days`-long club-local window ending at the end of today. */
export function trailingWindow(club: Club, days: number, now: Date = new Date()): DayWindow {
  const today = todayWindow(club, now)
  const from = new Date(today.to.getTime() - days * MINUTES_PER_DAY * 60_000)

  return { day: today.day, from, to: today.to, days }
}
