import { NextResponse } from 'next/server'
import { getCourtDayAvailability } from '@/features/booking/server/availability'
import { getMonthOpenSlots } from '@/features/booking/server/month-availability'
import {
  serialiseSlot,
  type AvailabilityPayload,
} from '@/features/booking/view/availability-payload'
import { parseDurationMinutes } from '@/features/booking/view/court-detail'
import { loadCatalog } from '@/features/courts/catalog'

/**
 * Availability for the booking form's calendar.
 *
 * One court, one length, and either a day's start times or a month's open-slot
 * counts — the two questions the calendar asks as the customer moves around.
 * Both are computed by the same builders the pages use, so a day shown as free
 * here is the day the form will actually offer.
 *
 * No caching: an open flag that outlives the booking it describes sells the
 * same slot twice.
 */

const CLUB_SLUG = 'baseline'
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_PATTERN = /^\d{4}-\d{2}$/

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const rawDay = params.get('day') ?? ''
  const rawMonth = params.get('month') ?? ''
  const day = DAY_PATTERN.test(rawDay) ? rawDay : null
  const month = MONTH_PATTERN.test(rawMonth) ? rawMonth : null

  if (!day && !month) {
    return fail('Ask for a day or a month.', 400)
  }

  const catalog = await loadCatalog(CLUB_SLUG)

  if (!catalog) {
    return fail('The schedule could not be read right now.', 503)
  }

  const { club, courts } = catalog
  const court = courts.find((entry) => entry.id === params.get('courtId'))

  if (!court) {
    return fail('That court could not be found.', 404)
  }

  const durationMinutes = parseDurationMinutes({ raw: params.get('duration') ?? undefined, club })

  const [dayResult, monthResult] = await Promise.all([
    day ? getCourtDayAvailability({ club, court, day, durationMinutes }) : null,
    month ? getMonthOpenSlots({ club, courts: [court], month, durationMinutes }) : null,
  ])

  const payload: AvailabilityPayload = {
    day,
    month,
    durationMinutes,
    slots: dayResult?.success ? dayResult.data.map(serialiseSlot) : [],
    days: monthResult?.success ? monthResult.data : null,
    error: dayResult && !dayResult.success ? dayResult.error : null,
  }

  return NextResponse.json(payload, { headers: { 'cache-control': 'no-store' } })
}

function fail(error: string, status: number) {
  const payload: AvailabilityPayload = {
    day: null,
    month: null,
    durationMinutes: 0,
    slots: [],
    days: null,
    error,
  }

  return NextResponse.json(payload, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}
