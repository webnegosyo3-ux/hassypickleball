import { beforeEach, describe, expect, it, vi } from 'vitest'

const findClubById = vi.fn()
const listActiveCourts = vi.fn()
const listActivePricingRules = vi.fn()
const findBusyRangesByCourt = vi.fn()
const findBusyRangesByCourtPublic = vi.fn()
const findCustomerByEmail = vi.fn()

/** Whether this process holds the service-role key. Flipped per test. */
const env = vi.hoisted(() => ({ hasServerSecret: true }))

vi.mock('@/lib/env', () => ({ hasServerSecret: () => env.hasServerSecret }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => ({}) }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({}) }))
vi.mock('@/lib/repositories/clubs', () => ({ findClubById }))
vi.mock('@/lib/repositories/courts', () => ({ listActiveCourts }))
vi.mock('@/lib/repositories/pricing-rules', () => ({ listActivePricingRules }))
vi.mock('@/lib/repositories/availability', () => ({
  findBusyRangesByCourt,
  findBusyRangesByCourtPublic,
}))
vi.mock('@/lib/repositories/customers', () => ({ findCustomerByEmail }))

const { getAvailability } = await import('./availability')

const CLUB = {
  id: 'club-1',
  name: 'Baseline',
  slug: 'baseline',
  timeZone: 'Asia/Manila',
  currency: 'PHP',
  opensAt: '06:00:00',
  closesAt: '22:00:00',
  slotMinutes: 30,
  minDurationMinutes: 60,
  maxDurationMinutes: 240,
}

const COURT = {
  id: 'court-1',
  clubId: 'club-1',
  name: 'Court 1',
  slug: 'court-1',
  surface: 'Acrylic',
  environment: 'outdoor' as const,
  isTournamentGrade: false,
  blurb: null,
  notes: null,
  tags: [],
  includes: [],
  heroImageUrl: null,
  basePriceCents: 60000,
  sortOrder: 1,
  isActive: true,
}

const VALID = {
  clubId: '11111111-1111-4111-8111-111111111111',
  day: '2026-03-01',
  durationMinutes: 60,
}

beforeEach(() => {
  vi.clearAllMocks()
  env.hasServerSecret = true
  findClubById.mockResolvedValue(CLUB)
  listActiveCourts.mockResolvedValue([COURT])
  listActivePricingRules.mockResolvedValue([])
  findBusyRangesByCourt.mockResolvedValue({})
  findBusyRangesByCourtPublic.mockResolvedValue({})
  findCustomerByEmail.mockResolvedValue(null)
})

describe('getAvailability', () => {
  it('rejects a malformed day rather than querying the database', async () => {
    const result = await getAvailability({ ...VALID, day: '01-03-2026' })

    expect(result.success).toBe(false)
    expect(findClubById).not.toHaveBeenCalled()
  })

  it('rejects a duration outside the club’s configured bounds', async () => {
    const result = await getAvailability({ ...VALID, durationMinutes: 600 })

    expect(result.success).toBe(false)
  })

  it('reports a missing club as not found instead of throwing', async () => {
    findClubById.mockResolvedValue(null)

    const result = await getAvailability(VALID)

    expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' })
  })

  it('returns a priced slot grid for each active court', async () => {
    const result = await getAvailability(VALID)

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data).toHaveLength(1)
    expect(result.data[0]?.courtId).toBe('court-1')
    expect(result.data[0]?.slots.length).toBeGreaterThan(0)
    expect(result.data[0]?.slots[0]?.priceCents).toBe(60000)
  })

  it('asks for busy ranges from local midnight to the club’s closing time', async () => {
    await getAvailability(VALID)

    const [, window] = findBusyRangesByCourt.mock.calls[0] ?? []

    // Manila is UTC+8, so the local day starts at 16:00 UTC the day before and
    // this club closes at 22:00 its own time.
    expect((window as { from: Date }).from.toISOString()).toBe('2026-02-28T16:00:00.000Z')
    expect((window as { to: Date }).to.toISOString()).toBe('2026-03-01T14:00:00.000Z')
  })

  it('reads past midnight when the club closes after it', async () => {
    // Arrange — a club that stays open until 01:00 sells a 12:00 AM start.
    findClubById.mockResolvedValue({ ...CLUB, closesAt: '01:00:00' })

    // Act
    await getAvailability(VALID)

    // Assert — the window runs to 01:00 the next morning, not to midnight.
    const [, window] = findBusyRangesByCourt.mock.calls[0] ?? []
    expect((window as { to: Date }).to.toISOString()).toBe('2026-03-01T17:00:00.000Z')
  })

  it('marks a slot unavailable when a booking covers it', async () => {
    findBusyRangesByCourt.mockResolvedValue({
      'court-1': [
        {
          startsAt: new Date('2026-02-28T22:00:00.000Z'),
          endsAt: new Date('2026-02-28T23:00:00.000Z'),
          isBlock: false,
        },
      ],
    })

    const result = await getAvailability(VALID)
    if (!result.success) throw new Error('expected success')

    const blocked = result.data[0]?.slots.find(
      (slot) => slot.startsAt.toISOString() === '2026-02-28T22:00:00.000Z',
    )

    expect(blocked?.isAvailable).toBe(false)
    expect(blocked?.isBlocked).toBe(false)
  })

  it('reports a slot the club is holding as blocked rather than booked', async () => {
    findBusyRangesByCourt.mockResolvedValue({
      'court-1': [
        {
          startsAt: new Date('2026-02-28T22:00:00.000Z'),
          endsAt: new Date('2026-02-28T23:00:00.000Z'),
          isBlock: true,
        },
      ],
    })

    const result = await getAvailability(VALID)
    if (!result.success) throw new Error('expected success')

    const blocked = result.data[0]?.slots.find(
      (slot) => slot.startsAt.toISOString() === '2026-02-28T22:00:00.000Z',
    )

    expect(blocked?.isBlocked).toBe(true)
  })

  it('prices at the customer’s tier when an email identifies a known member', async () => {
    findCustomerByEmail.mockResolvedValue({ tier: 'pro' })

    await getAvailability({ ...VALID, email: 'ana@example.com' })

    expect(findCustomerByEmail).toHaveBeenCalledWith(
      expect.anything(),
      VALID.clubId,
      'ana@example.com',
    )
  })

  it('does not look a customer up when no email was supplied', async () => {
    await getAvailability(VALID)

    expect(findCustomerByEmail).not.toHaveBeenCalled()
  })

  it('turns a repository failure into an error result rather than crashing the page', async () => {
    listActiveCourts.mockRejectedValue(new Error('connection reset'))

    const result = await getAvailability(VALID)

    expect(result).toMatchObject({ success: false, code: 'UNEXPECTED' })
  })
})

describe('getAvailability without the service-role key', () => {
  it('reads the public busy intervals instead, and still prices the day', async () => {
    env.hasServerSecret = false

    const result = await getAvailability(VALID)

    expect(result.success).toBe(true)
    expect(findBusyRangesByCourtPublic).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ clubId: CLUB.id }),
    )
    expect(findBusyRangesByCourt).not.toHaveBeenCalled()
  })

  it('prices at the standard tier rather than guessing a member tier', async () => {
    env.hasServerSecret = false

    await getAvailability({ ...VALID, email: 'ana@example.com' })

    // A member's tier lives behind RLS; without the key the lookup is skipped
    // instead of quietly pricing the customer as somebody they may not be.
    expect(findCustomerByEmail).not.toHaveBeenCalled()
  })
})
