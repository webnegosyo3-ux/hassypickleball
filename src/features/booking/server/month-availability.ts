import 'server-only'

import { ok, type Result } from '@/lib/api/result'
import { zonedTimeToUtc } from '@/lib/domain/time'
import { findBusyRangesByCourt, findBusyRangesByCourtPublic } from '@/lib/repositories/availability'
import { listActivePricingRules } from '@/lib/repositories/pricing-rules'
import { buildCourtAvailability } from '@/lib/services/availability'
import { availabilityAccess } from './access'
import { describeMonth } from '../view/month-calendar'
import type { Club, Court } from '@/lib/repositories/mappers'

/**
 * One month's open-slot counts, for the calendar.
 *
 * The calendar asks a coarse question — "does this day still have anything?" —
 * and it is answered with a single read: every busy interval in the month, not
 * one query per day. Each day is then priced and gridded in memory by the same
 * builder the court page uses, so the number on a day cell and the times behind
 * it can never disagree.
 *
 * Counts are computed at the default session length. They are an indicator, not
 * a promise: picking a day re-reads it at the length the customer chooses.
 */
export async function getMonthOpenSlots(input: {
  readonly club: Club
  readonly courts: readonly Court[]
  /** "YYYY-MM". */
  readonly month: string
  readonly durationMinutes: number
}): Promise<Result<Readonly<Record<string, number>>>> {
  const { club, courts, month, durationMinutes } = input

  if (courts.length === 0) {
    return ok({})
  }

  const grid = describeMonth(month, club.timeZone)

  try {
    const { client, privileged } = await availabilityAccess()

    const from = zonedTimeToUtc(grid.firstDay, 0, club.timeZone)
    // The whole month in one window: the last day's midnight, plus a day.
    const to = new Date(from.getTime() + 32 * 24 * 60 * 60 * 1000)

    const [rules, busyByCourt] = await Promise.all([
      listActivePricingRules(client, club.id),
      privileged
        ? findBusyRangesByCourt(client, {
            courtIds: courts.map((court) => court.id),
            from,
            to,
          })
        : findBusyRangesByCourtPublic(client, { clubId: club.id, from, to }),
    ])

    const pricedCourts = courts.map((court) => ({
      id: court.id,
      name: court.name,
      basePriceCents: court.basePriceCents,
    }))

    const now = new Date()
    const today = now.toLocaleDateString('en-CA', { timeZone: club.timeZone })
    const openByDay: Record<string, number> = {}

    for (let index = 0; index < 32; index += 1) {
      const day = new Date(`${grid.firstDay}T12:00:00Z`)
      day.setUTCDate(day.getUTCDate() + index)
      const dayString = day.toISOString().slice(0, 10)

      if (dayString > grid.lastDay) {
        break
      }

      // A day already behind us has nothing to offer, and computing it would
      // only spend the grid on times that cannot be booked.
      if (dayString < today) {
        openByDay[dayString] = 0
        continue
      }

      const availability = buildCourtAvailability({
        club,
        courts: pricedCourts,
        busyByCourt,
        day: dayString,
        durationMinutes,
        rules,
        tier: 'standard',
        now: dayString === today ? now : undefined,
      })

      openByDay[dayString] = availability.reduce((total, court) => total + court.openCount, 0)
    }

    return ok(openByDay)
  } catch (error: unknown) {
    // The calendar is a convenience over the day page, which reads on its own.
    // A month that cannot be counted still renders — just without the counts.
    console.warn('Month availability read failed:', describeError(error))

    return ok({})
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
