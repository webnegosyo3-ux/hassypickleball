import 'server-only'

import { err, ok, type Result } from '@/lib/api/result'
import { availabilityQuerySchema } from '@/lib/api/schemas'
import { openWindowMinutes, zonedTimeToUtc } from '@/lib/domain/time'
import {
  buildCourtAvailability,
  type AvailabilitySlot,
  type CourtAvailability,
} from '@/lib/services/availability'
import { findBusyRangesByCourt, findBusyRangesByCourtPublic } from '@/lib/repositories/availability'
import { findClubById } from '@/lib/repositories/clubs'
import { listActiveCourts } from '@/lib/repositories/courts'
import { findCustomerByEmail } from '@/lib/repositories/customers'
import { listActivePricingRules } from '@/lib/repositories/pricing-rules'
import { availabilityAccess } from './access'
import type { Client } from '@/lib/repositories/support'
import type { CustomerTier } from '@/lib/domain/types'
import type { Club, Court } from '@/lib/repositories/mappers'

/**
 * The window a day's bookings are read over: the club-local calendar day, run
 * on to closing time.
 *
 * A club that closes at 01:00 sells a 12:00 AM start, and that session lives on
 * the next calendar day — reading only to midnight would report the slot free
 * while somebody already holds it.
 */
function busyWindow(day: string, club: Club): { readonly from: Date; readonly to: Date } {
  const { closesAt } = openWindowMinutes(club.opensAt, club.closesAt)

  return {
    from: zonedTimeToUtc(day, 0, club.timeZone),
    to: zonedTimeToUtc(day, closesAt, club.timeZone),
  }
}

/**
 * The slot grid behind the court picker.
 *
 * Reads with the service-role client because availability must reflect *every*
 * booking, including other customers' — which RLS deliberately hides from anon.
 * Nothing customer-identifying is returned: only start times, prices, and a
 * taken/free flag.
 */
export async function getAvailability(input: unknown): Promise<Result<CourtAvailability[]>> {
  const parsed = availabilityQuerySchema.safeParse(input)

  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? 'Check the date and duration', 'INVALID')
  }

  const query = parsed.data

  try {
    // Inside the try on purpose: a misconfigured client throws here, and an
    // uncaught throw inside a suspended server component leaves the page on its
    // skeleton forever instead of saying what went wrong.
    const { client, privileged } = await availabilityAccess()
    const club = await findClubById(client, query.clubId)

    if (!club) {
      return err('That club could not be found', 'NOT_FOUND')
    }

    if (
      query.durationMinutes < club.minDurationMinutes ||
      query.durationMinutes > club.maxDurationMinutes
    ) {
      return err(
        `Sessions run from ${club.minDurationMinutes} to ${club.maxDurationMinutes} minutes`,
        'INVALID',
      )
    }

    const [courts, rules, tier] = await Promise.all([
      listActiveCourts(client, query.clubId),
      listActivePricingRules(client, query.clubId),
      resolveTier({ client, privileged }, query.clubId, query.email),
    ])

    const visible = query.courtId ? courts.filter((court) => court.id === query.courtId) : courts

    const { from, to } = busyWindow(query.day, club)

    const busyByCourt = privileged
      ? await findBusyRangesByCourt(client, {
          courtIds: visible.map((court) => court.id),
          from,
          to,
        })
      : await findBusyRangesByCourtPublic(client, { clubId: club.id, from, to })

    // Pass the current instant only for today so that slots whose start time
    // has already passed are shown as unavailable rather than falsely open.
    // For future dates every slot's availability is driven by bookings alone.
    const now = new Date()
    const todayInZone = now.toLocaleDateString('en-CA', { timeZone: club.timeZone })
    const isToday = query.day === todayInZone

    return ok([
      ...buildCourtAvailability({
        club,
        courts: visible.map((court) => ({
          id: court.id,
          name: court.name,
          basePriceCents: court.basePriceCents,
        })),
        busyByCourt,
        day: query.day,
        durationMinutes: query.durationMinutes,
        rules,
        tier,
        now: isToday ? now : undefined,
      }),
    ])
  } catch (error: unknown) {
    // A warning, and the message only: a stack in the browser console reads as
    // a crash, and whoever fixed this only needs the sentence. The detail here
    // names infrastructure the customer cannot act on, so it stays in the log.
    console.warn('Availability read failed:', describeError(error))

    return err('Times could not be loaded right now. Please try again.', 'UNEXPECTED')
  }
}

/** Tier pricing only applies to a customer we can actually identify. */
async function resolveTier(
  access: { readonly client: Client; readonly privileged: boolean },
  clubId: string,
  email: string | undefined,
): Promise<CustomerTier> {
  if (!email || !access.privileged) {
    return 'standard'
  }

  const customer = await findCustomerByEmail(access.client, clubId, email)

  return customer?.tier ?? 'standard'
}

export type CourtDayAvailabilityInput = {
  readonly club: Club
  readonly court: Court
  /** Club-local calendar day, "YYYY-MM-DD". */
  readonly day: string
  readonly durationMinutes: number
}

/**
 * One court's day of start times, for the court detail page.
 *
 * The page already holds the club and the court from the cached catalog, so
 * this skips the club lookup, the court list, and the tier lookup that
 * getAvailability pays for — the page has no email to price against. What is
 * left — the pricing rules, and the bookings and blocks for that one court —
 * is read in one parallel wave instead of two.
 *
 * Availability is never cached: a stale open flag sells the same slot twice.
 */
export async function getCourtDayAvailability(
  input: CourtDayAvailabilityInput,
): Promise<Result<AvailabilitySlot[]>> {
  const { club, court, day, durationMinutes } = input

  if (durationMinutes < club.minDurationMinutes || durationMinutes > club.maxDurationMinutes) {
    return err(
      `Sessions run from ${club.minDurationMinutes} to ${club.maxDurationMinutes} minutes`,
      'INVALID',
    )
  }

  try {
    const { client, privileged } = await availabilityAccess()

    const { from, to } = busyWindow(day, club)

    const [rules, busyByCourt] = await Promise.all([
      listActivePricingRules(client, club.id),
      privileged
        ? findBusyRangesByCourt(client, { courtIds: [court.id], from, to })
        : findBusyRangesByCourtPublic(client, { clubId: club.id, from, to }),
    ])

    // Past start times only matter for today; for a future day every slot is
    // decided by the bookings and blocks alone.
    const now = new Date()
    const isToday = day === now.toLocaleDateString('en-CA', { timeZone: club.timeZone })

    const [availability] = buildCourtAvailability({
      club,
      courts: [{ id: court.id, name: court.name, basePriceCents: court.basePriceCents }],
      busyByCourt,
      day,
      durationMinutes,
      rules,
      tier: 'standard',
      now: isToday ? now : undefined,
    })

    return ok([...availability.slots])
  } catch (error: unknown) {
    console.warn('Court day availability read failed:', describeError(error))

    return err('Times could not be loaded right now. Please try again.', 'UNEXPECTED')
  }
}

/** The sentence, not the stack: these failures are configuration, not code. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
