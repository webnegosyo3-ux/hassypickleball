import 'server-only'

import { LIVE_BOOKING_STATUSES, raise, RepositoryError, type Client } from './support'
import type { BusyRange } from '@/lib/domain/types'

/**
 * Every interval that makes a court unbookable in a window: live bookings and
 * maintenance blocks, grouped by court. Both are fetched for the same window so
 * the calendar and the database agree on what is taken.
 *
 * Each range says which of the two took it. The storefront shows both as
 * unavailable, but it names the reason — a customer reading "Blocked" is not
 * left guessing that somebody beat them to the slot.
 */
export async function findBusyRangesByCourt(
  client: Client,
  input: { readonly courtIds: readonly string[]; readonly from: Date; readonly to: Date },
): Promise<Record<string, BusyRange[]>> {
  if (input.courtIds.length === 0) {
    return {}
  }

  const fromIso = input.from.toISOString()
  const toIso = input.to.toISOString()

  const [bookings, blocks] = await Promise.all([
    client
      .from('booking_courts')
      .select('court_id, starts_at, ends_at')
      .in('court_id', [...input.courtIds])
      .in('status', [...LIVE_BOOKING_STATUSES])
      .lt('starts_at', toIso)
      .gt('ends_at', fromIso),
    client
      .from('availability_blocks')
      .select('court_id, starts_at, ends_at')
      .in('court_id', [...input.courtIds])
      .lt('starts_at', toIso)
      .gt('ends_at', fromIso),
  ])

  raise('Failed to load bookings', bookings.error)
  raise('Failed to load availability blocks', blocks.error)

  const rows = [
    ...(bookings.data ?? []).map((row) => ({ ...row, isBlock: false })),
    ...(blocks.data ?? []).map((row) => ({ ...row, isBlock: true })),
  ]

  return groupByCourt(rows)
}

/**
 * The same answer, asked of `court_day_busy` instead of the tables.
 *
 * A visitor is not allowed to read other people's booking rows, and should not
 * be: the calendar only needs to know that an interval is taken. That function
 * returns intervals and nothing else, so this path works with the anon key -
 * which is what lets the storefront show what is booked without a service-role
 * secret on the server.
 *
 * `is_block` is what separates "Blocked" from "Booked" in the UI: a customer
 * reading the first knows the club took the slot, not that somebody beat them
 * to it.
 */
export async function findBusyRangesByCourtPublic(
  client: Client,
  input: { readonly clubId: string; readonly from: Date; readonly to: Date },
): Promise<Record<string, BusyRange[]>> {
  const { data, error } = await client.rpc('court_day_busy', {
    p_club_id: input.clubId,
    p_from: input.from.toISOString(),
    p_to: input.to.toISOString(),
  })

  if (error) {
    // PGRST202 is PostgREST's "no such function in the schema cache": the
    // database is older than this code. Only an operator can fix that, and only
    // if they are told which migration is missing — the raw PostgREST sentence
    // names the function but not the file that creates it.
    if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message)) {
      throw new RepositoryError(MISSING_FUNCTION_HINT, error.code)
    }

    raise('Failed to load availability', error)
  }

  return groupByCourt(data ?? [])
}

const MISSING_FUNCTION_HINT =
  'court_day_busy is missing from the database. Apply supabase/migrations/20261127000000_public_court_availability.sql (pnpm db:push).'

function groupByCourt(
  rows: readonly {
    readonly court_id: string
    readonly starts_at: string
    readonly ends_at: string
    readonly isBlock?: boolean
    readonly is_block?: boolean
  }[],
): Record<string, BusyRange[]> {
  return rows.reduce<Record<string, BusyRange[]>>((grouped, row) => {
    const range = {
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      isBlock: row.isBlock ?? row.is_block ?? false,
    }
    const existing = grouped[row.court_id] ?? []

    return { ...grouped, [row.court_id]: [...existing, range] }
  }, {})
}
