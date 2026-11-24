import 'server-only'

import { err, ok, type Result } from '@/lib/api/result'
import { availabilityQuerySchema } from '@/lib/api/schemas'
import { zonedTimeToUtc } from '@/lib/domain/time'
import { buildCourtAvailability, type CourtAvailability } from '@/lib/services/availability'
import { findBusyRangesByCourt } from '@/lib/repositories/availability'
import { findClubById } from '@/lib/repositories/clubs'
import { listActiveCourts } from '@/lib/repositories/courts'
import { findCustomerByEmail } from '@/lib/repositories/customers'
import { listActivePricingRules } from '@/lib/repositories/pricing-rules'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { CustomerTier } from '@/lib/domain/types'

const DAY_MS = 24 * 60 * 60 * 1000

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
  const client = createSupabaseAdminClient()

  try {
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
      resolveTier(client, query.clubId, query.email),
    ])

    const visible = query.courtId ? courts.filter((court) => court.id === query.courtId) : courts

    // The busy window is the club-local calendar day, not a UTC day — in
    // Asia/Manila those differ by eight hours.
    const from = zonedTimeToUtc(query.day, 0, club.timeZone)
    const to = new Date(from.getTime() + DAY_MS)

    const busyByCourt = await findBusyRangesByCourt(client, {
      courtIds: visible.map((court) => court.id),
      from,
      to,
    })

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
    const message = error instanceof Error ? error.message : 'Unexpected error'

    return err(message, 'UNEXPECTED')
  }
}

/** Tier pricing only applies to a customer we can actually identify. */
async function resolveTier(
  client: ReturnType<typeof createSupabaseAdminClient>,
  clubId: string,
  email: string | undefined,
): Promise<CustomerTier> {
  if (!email) {
    return 'standard'
  }

  const customer = await findCustomerByEmail(client, clubId, email)

  return customer?.tier ?? 'standard'
}
