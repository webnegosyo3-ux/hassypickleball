import { describe, expect, it } from 'vitest'
import { toClub, toCourt, toPricingRule, toProduct } from './mappers'

describe('toClub', () => {
  it('maps a club row to the domain shape', () => {
    const club = toClub({
      id: 'club-1',
      name: 'Baseline Pickleball Club',
      slug: 'baseline',
      timezone: 'Asia/Manila',
      currency: 'PHP',
      opens_at: '06:00:00',
      closes_at: '22:00:00',
      slot_minutes: 30,
      min_duration_minutes: 30,
      max_duration_minutes: 240,
      phone: '(555) 019-8842',
      cancellation_window_hours: 12,
      group_booking_note: 'Book two adjacent courts and we will set up the divider net.',
    })

    expect(club).toEqual({
      id: 'club-1',
      name: 'Baseline Pickleball Club',
      slug: 'baseline',
      timeZone: 'Asia/Manila',
      currency: 'PHP',
      opensAt: '06:00:00',
      closesAt: '22:00:00',
      slotMinutes: 30,
      minDurationMinutes: 30,
      maxDurationMinutes: 240,
      phone: '(555) 019-8842',
      cancellationWindowHours: 12,
      groupBookingNote: 'Book two adjacent courts and we will set up the divider net.',
    })
  })

  it('keeps the optional contact and group-booking copy null rather than inventing it', () => {
    // Arrange — a club that has not filled in the storefront extras yet.
    const club = toClub({
      id: 'club-2',
      name: 'Quiet Club',
      slug: 'quiet',
      timezone: 'Asia/Manila',
      currency: 'PHP',
      opens_at: '06:00:00',
      closes_at: '22:00:00',
      slot_minutes: 30,
      min_duration_minutes: 30,
      max_duration_minutes: 240,
      phone: null,
      cancellation_window_hours: 12,
      group_booking_note: null,
    })

    // Assert — the page decides what to hide; the mapper never fabricates copy.
    expect(club.phone).toBeNull()
    expect(club.groupBookingNote).toBeNull()
  })
})

describe('toCourt', () => {
  const row = {
    id: 'court-1',
    club_id: 'club-1',
    name: 'Court 1 — Center',
    slug: 'court-1',
    surface: 'Cushioned acrylic',
    environment: 'indoor' as const,
    is_tournament_grade: true,
    blurb: 'Show court',
    notes: ['Non-marking shoes required'],
    tags: ['Tournament'],
    includes: ['Net and posts'],
    hero_image_url: null,
    base_price_cents: 90000,
    sort_order: 1,
    is_active: true,
    min_players: 2,
    max_players: 4,
    included_players: 4,
    extra_player_fee_cents: 0,
  }

  it('maps a court row to the domain shape', () => {
    expect(toCourt(row)).toMatchObject({
      id: 'court-1',
      clubId: 'club-1',
      name: 'Court 1 — Center',
      surface: 'Cushioned acrylic',
      environment: 'indoor',
      isTournamentGrade: true,
      basePriceCents: 90000,
      isActive: true,
    })
  })

  it('carries the player capacity through, so the booking form can bound pax', () => {
    const court = toCourt({ ...row, min_players: 2, max_players: 6 })

    expect(court.minPlayers).toBe(2)
    expect(court.maxPlayers).toBe(6)
  })

  it('carries pax pricing through for court management and booking quotes', () => {
    const court = toCourt({ ...row, included_players: 4, extra_player_fee_cents: 15_000 })

    expect(court.includedPlayers).toBe(4)
    expect(court.extraPlayerFeeCents).toBe(15_000)
  })

  it('preserves array columns as arrays', () => {
    const court = toCourt(row)

    expect(court.tags).toEqual(['Tournament'])
    expect(court.includes).toEqual(['Net and posts'])
  })

  it('substitutes empty arrays when array columns are null', () => {
    const court = toCourt({ ...row, tags: null, includes: null, notes: null })

    expect(court.tags).toEqual([])
    expect(court.includes).toEqual([])
    expect(court.notes).toEqual([])
  })

  it('keeps each "good to know" note a separate entry so the page can list them', () => {
    // Arrange — the design renders one line per note, not one paragraph.
    const court = toCourt({
      ...row,
      notes: ['Lights on automatically after 7pm', 'Play may pause in heavy rain'],
    })

    // Assert
    expect(court.notes).toEqual([
      'Lights on automatically after 7pm',
      'Play may pause in heavy rain',
    ])
  })
})

describe('toProduct', () => {
  it('maps a product row to the domain shape', () => {
    const product = toProduct({
      id: 'p-1',
      club_id: 'club-1',
      name: 'Paddle rental',
      description: 'Graphite paddle',
      type: 'addon' as const,
      price_cents: 20000,
      has_quantity: true,
      image_url: null,
      sort_order: 1,
      is_active: true,
    })

    expect(product).toMatchObject({
      id: 'p-1',
      name: 'Paddle rental',
      type: 'addon',
      priceCents: 20000,
      hasQuantity: true,
    })
  })
})

describe('toPricingRule', () => {
  const row = {
    id: 'rule-1',
    club_id: 'club-1',
    court_id: null,
    label: 'Weekend surcharge',
    days_of_week: [0, 6],
    starts_at_time: null,
    ends_at_time: null,
    min_duration_minutes: null,
    applies_to_tier: null,
    kind: 'percent_delta' as const,
    value_cents: null,
    value_percent: 25,
    priority: 30,
    is_active: true,
  }

  it('maps a pricing rule row into the shape the pricing engine expects', () => {
    expect(toPricingRule(row)).toEqual({
      id: 'rule-1',
      label: 'Weekend surcharge',
      courtId: null,
      daysOfWeek: [0, 6],
      startsAtTime: null,
      endsAtTime: null,
      minDurationMinutes: null,
      appliesToTier: null,
      kind: 'percent_delta',
      valueCents: null,
      valuePercent: 25,
      priority: 30,
      isActive: true,
    })
  })

  it('substitutes an empty day list when the column is null', () => {
    expect(toPricingRule({ ...row, days_of_week: null }).daysOfWeek).toEqual([])
  })

  it('coerces a numeric-string percent from Postgres into a number', () => {
    // Postgres numeric columns arrive as strings over PostgREST.
    expect(toPricingRule({ ...row, value_percent: '25.000' }).valuePercent).toBe(25)
  })

  it('keeps a null percent null rather than coercing it to zero', () => {
    const rule = toPricingRule({
      ...row,
      kind: 'amount_delta' as const,
      value_percent: null,
      value_cents: 5000,
    })

    expect(rule.valuePercent).toBeNull()
    expect(rule.valueCents).toBe(5000)
  })

  it('carries a court-scoped rule through', () => {
    expect(toPricingRule({ ...row, court_id: 'court-1' }).courtId).toBe('court-1')
  })
})
