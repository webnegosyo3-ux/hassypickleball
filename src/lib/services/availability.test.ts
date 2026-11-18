import { describe, expect, it } from 'vitest'
import { buildCourtAvailability } from './availability'
import type { Club } from '@/lib/repositories/mappers'

const club: Club = {
  id: 'club-1',
  name: 'Baseline',
  slug: 'baseline',
  timeZone: 'Asia/Manila',
  currency: 'PHP',
  opensAt: '06:00',
  closesAt: '09:00',
  slotMinutes: 60,
  minDurationMinutes: 60,
  maxDurationMinutes: 240,
  phone: '(555) 019-8842',
  cancellationWindowHours: 12,
  groupBookingNote: null,
}

const court = {
  id: 'court-1',
  name: 'Court 1',
  basePriceCents: 60000,
}

describe('buildCourtAvailability', () => {
  it('offers every open start when the court has no conflicts', () => {
    const [availability] = buildCourtAvailability({
      club,
      courts: [court],
      busyByCourt: {},
      day: '2026-03-16',
      durationMinutes: 60,
      rules: [],
      tier: 'standard',
    })

    // 06:00, 07:00, 08:00 Manila -> 22:00, 23:00 (prev day) and 00:00 UTC
    expect(availability.slots).toHaveLength(3)
    expect(availability.slots.every((slot) => slot.isAvailable)).toBe(true)
  })

  it('marks a slot unavailable when it collides with a busy window', () => {
    const [availability] = buildCourtAvailability({
      club,
      courts: [court],
      busyByCourt: {
        'court-1': [
          {
            startsAt: new Date('2026-03-15T23:00:00Z'), // 07:00 Manila
            endsAt: new Date('2026-03-16T00:00:00Z'),
          },
        ],
      },
      day: '2026-03-16',
      durationMinutes: 60,
      rules: [],
      tier: 'standard',
    })

    const unavailable = availability.slots.filter((slot) => !slot.isAvailable)

    expect(unavailable).toHaveLength(1)
    expect(unavailable[0].startsAt.toISOString()).toBe('2026-03-15T23:00:00.000Z')
  })

  it('prices every slot, including unavailable ones, so the UI can show a rate', () => {
    const [availability] = buildCourtAvailability({
      club,
      courts: [court],
      busyByCourt: {},
      day: '2026-03-16',
      durationMinutes: 60,
      rules: [],
      tier: 'standard',
    })

    expect(availability.slots.every((slot) => slot.priceCents === 60000)).toBe(true)
  })

  it('applies pricing rules per slot rather than once per court', () => {
    const [availability] = buildCourtAvailability({
      club,
      courts: [court],
      busyByCourt: {},
      day: '2026-03-16',
      durationMinutes: 60,
      rules: [
        {
          id: 'early',
          label: 'Early bird',
          courtId: null,
          daysOfWeek: [],
          startsAtTime: '06:00',
          endsAtTime: '07:00',
          minDurationMinutes: null,
          appliesToTier: null,
          kind: 'percent_delta',
          valueCents: null,
          valuePercent: -50,
          priority: 10,
          isActive: true,
        },
      ],
      tier: 'standard',
    })

    // Only the 06:00 Manila slot is discounted.
    expect(availability.slots.map((slot) => slot.priceCents)).toEqual([30000, 60000, 60000])
  })

  it('returns one entry per court', () => {
    const availability = buildCourtAvailability({
      club,
      courts: [court, { id: 'court-2', name: 'Court 2', basePriceCents: 90000 }],
      busyByCourt: {},
      day: '2026-03-16',
      durationMinutes: 60,
      rules: [],
      tier: 'standard',
    })

    expect(availability.map((entry) => entry.courtId)).toEqual(['court-1', 'court-2'])
  })

  it('reports a court with no open slots as fully booked', () => {
    const [availability] = buildCourtAvailability({
      club,
      courts: [court],
      busyByCourt: {
        'court-1': [
          {
            startsAt: new Date('2026-03-15T00:00:00Z'),
            endsAt: new Date('2026-03-17T00:00:00Z'),
          },
        ],
      },
      day: '2026-03-16',
      durationMinutes: 60,
      rules: [],
      tier: 'standard',
    })

    expect(availability.openCount).toBe(0)
    expect(availability.slots.every((slot) => !slot.isAvailable)).toBe(true)
  })

  it('returns no slots when the requested duration cannot fit the day', () => {
    const [availability] = buildCourtAvailability({
      club,
      courts: [court],
      busyByCourt: {},
      day: '2026-03-16',
      durationMinutes: 300,
      rules: [],
      tier: 'standard',
    })

    expect(availability.slots).toEqual([])
    expect(availability.openCount).toBe(0)
  })

  it('returns an empty list when the club has no courts', () => {
    expect(
      buildCourtAvailability({
        club,
        courts: [],
        busyByCourt: {},
        day: '2026-03-16',
        durationMinutes: 60,
        rules: [],
        tier: 'standard',
      }),
    ).toEqual([])
  })
})
