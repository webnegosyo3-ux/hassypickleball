import { beforeEach, describe, expect, it, vi } from 'vitest'

const findBusyRangesByCourt = vi.fn()
const findBusyRangesByCourtPublic = vi.fn()
const listActiveCourts = vi.fn()
const listActivePricingRules = vi.fn()
const findClubById = vi.fn()

/** Whether this process holds the service-role key. Flipped per test. */
const env = vi.hoisted(() => ({ hasServerSecret: true }))

vi.mock('@/lib/env', () => ({ hasServerSecret: () => env.hasServerSecret }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
vi.mock('@/lib/repositories/availability', () => ({
  findBusyRangesByCourt,
  findBusyRangesByCourtPublic,
}))
vi.mock('@/lib/repositories/courts', () => ({ listActiveCourts }))
vi.mock('@/lib/repositories/pricing-rules', () => ({ listActivePricingRules }))
vi.mock('@/lib/repositories/clubs', () => ({ findClubById }))

const { countOpenSlots } = await import('./open-slots')

const CLUB = {
  id: 'club-1',
  name: 'Baseline',
  slug: 'baseline',
  timeZone: 'Asia/Manila',
  currency: 'PHP',
  opensAt: '06:00:00',
  closesAt: '10:00:00',
  slotMinutes: 60,
  minDurationMinutes: 60,
  maxDurationMinutes: 240,
  phone: '(555) 019-8842',
  cancellationWindowHours: 12,
  groupBookingNote: null,
}

/** 06:00–10:00 Manila at 60-minute steps: four one-hour starts. */
const STARTS_IN_DAY = 4

const COURT_IDS = ['court-1', 'court-2']

beforeEach(() => {
  vi.clearAllMocks()
  env.hasServerSecret = true
  findBusyRangesByCourt.mockResolvedValue({})
  findBusyRangesByCourtPublic.mockResolvedValue({})
})

describe('countOpenSlots', () => {
  it('counts every start time when nothing is booked', async () => {
    const counts = await countOpenSlots({ club: CLUB, courtIds: COURT_IDS, day: '2026-03-01' })

    expect(counts).toEqual({ 'court-1': STARTS_IN_DAY, 'court-2': STARTS_IN_DAY })
  })

  it('drops the start times a booking covers', async () => {
    findBusyRangesByCourt.mockResolvedValue({
      'court-1': [
        {
          startsAt: new Date('2026-02-28T22:00:00Z'),
          endsAt: new Date('2026-02-28T23:00:00Z'),
        },
      ],
    })

    const counts = await countOpenSlots({ club: CLUB, courtIds: COURT_IDS, day: '2026-03-01' })

    expect(counts?.['court-1']).toBe(STARTS_IN_DAY - 1)
    expect(counts?.['court-2']).toBe(STARTS_IN_DAY)
  })

  it('reports zero for a court with nothing left, rather than omitting it', async () => {
    findBusyRangesByCourt.mockResolvedValue({
      'court-1': [
        {
          startsAt: new Date('2026-02-28T00:00:00Z'),
          endsAt: new Date('2026-03-02T00:00:00Z'),
        },
      ],
    })

    const counts = await countOpenSlots({ club: CLUB, courtIds: COURT_IDS, day: '2026-03-01' })

    expect(counts?.['court-1']).toBe(0)
  })

  // The catalog must still render if this privileged read fails; a wrong
  // "fully booked" costs a booking.
  it('returns undefined rather than throwing when the read fails', async () => {
    findBusyRangesByCourt.mockRejectedValue(new Error('connection refused'))

    await expect(
      countOpenSlots({ club: CLUB, courtIds: COURT_IDS, day: '2026-03-01' }),
    ).resolves.toBeUndefined()
  })

  it('does no work and hits no database when the club has no courts', async () => {
    const counts = await countOpenSlots({ club: CLUB, courtIds: [], day: '2026-03-01' })

    expect(counts).toEqual({})
    expect(findBusyRangesByCourt).not.toHaveBeenCalled()
  })

  // The caller already holds the club and the court list. Re-reading them, and
  // pricing every slot just to count them, is work the catalog pays for on
  // every render.
  it('reuses the club and courts it is given instead of re-reading them', async () => {
    await countOpenSlots({ club: CLUB, courtIds: COURT_IDS, day: '2026-03-01' })

    expect(findClubById).not.toHaveBeenCalled()
    expect(listActiveCourts).not.toHaveBeenCalled()
    expect(listActivePricingRules).not.toHaveBeenCalled()
  })

  it('asks for the club-local day through to closing time, not a UTC day', async () => {
    await countOpenSlots({ club: CLUB, courtIds: COURT_IDS, day: '2026-03-01' })

    const [, range] = findBusyRangesByCourt.mock.calls[0]

    // Manila is UTC+8, so the club day starts at 16:00 UTC the day before and
    // closes at 10:00 its own time.
    expect(range.from.toISOString()).toBe('2026-02-28T16:00:00.000Z')
    expect(range.to.toISOString()).toBe('2026-03-01T02:00:00.000Z')
  })

  // A 12:00 AM start only exists because the club day runs past midnight; the
  // count has to include it or the catalog under-reports the day.
  it('counts the 12:00 AM start of a club that closes at 01:00', async () => {
    const lateClub = { ...CLUB, closesAt: '01:00:00' }

    const counts = await countOpenSlots({
      club: lateClub,
      courtIds: COURT_IDS,
      day: '2026-03-01',
    })

    // 06:00 through 12:00 AM at 60-minute steps, plus the 01:00 close itself is
    // not a start: nineteen one-hour starts.
    expect(counts?.['court-1']).toBe(19)

    const [, range] = findBusyRangesByCourt.mock.calls[0]
    expect(range.to.toISOString()).toBe('2026-03-01T17:00:00.000Z')
  })

  // The storefront runs without a service-role key, and the catalog used to
  // lose its counts there because this read asked for one regardless.
  describe('without the service-role key', () => {
    beforeEach(() => {
      env.hasServerSecret = false
    })

    it('counts from the public busy intervals instead of dropping the numbers', async () => {
      findBusyRangesByCourtPublic.mockResolvedValue({
        'court-1': [
          {
            startsAt: new Date('2026-02-28T22:00:00Z'),
            endsAt: new Date('2026-02-28T23:00:00Z'),
          },
        ],
      })

      const counts = await countOpenSlots({ club: CLUB, courtIds: COURT_IDS, day: '2026-03-01' })

      expect(counts?.['court-1']).toBe(STARTS_IN_DAY - 1)
      expect(counts?.['court-2']).toBe(STARTS_IN_DAY)
      expect(findBusyRangesByCourt).not.toHaveBeenCalled()
    })
  })
})
