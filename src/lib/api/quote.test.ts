import { describe, expect, it } from 'vitest'
import { quoteSelections } from './quote'
import type { PricingRule } from '@/lib/domain/types'

const MANILA = 'Asia/Manila'
const COURT_A = '00000000-0000-4000-8000-00000000000a'
const COURT_B = '00000000-0000-4000-8000-00000000000b'

const courts = [
  { id: COURT_A, basePriceCents: 60000 },
  { id: COURT_B, basePriceCents: 90000 },
]

const weekendSurcharge: PricingRule = {
  id: 'weekend',
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
  priority: 10,
  isActive: true,
}

describe('quoteSelections', () => {
  it('prices each requested segment from its own court base rate', () => {
    const quoted = quoteSelections({
      selections: [
        {
          courtId: COURT_A,
          startsAt: new Date('2026-03-16T02:00:00Z'),
          endsAt: new Date('2026-03-16T03:00:00Z'),
        },
        {
          courtId: COURT_B,
          startsAt: new Date('2026-03-16T02:00:00Z'),
          endsAt: new Date('2026-03-16T03:00:00Z'),
        },
      ],
      courts,
      rules: [],
      timeZone: MANILA,
      tier: 'standard',
    })

    expect(quoted.map((q) => q.priceCents)).toEqual([60000, 90000])
  })

  it('applies matching pricing rules to the segment', () => {
    // 2026-03-15 is a Sunday in Manila.
    const quoted = quoteSelections({
      selections: [
        {
          courtId: COURT_A,
          startsAt: new Date('2026-03-15T02:00:00Z'),
          endsAt: new Date('2026-03-15T03:00:00Z'),
        },
      ],
      courts,
      rules: [weekendSurcharge],
      timeZone: MANILA,
      tier: 'standard',
    })

    expect(quoted[0].priceCents).toBe(75000)
  })

  it('throws when a selection names a court that does not exist', () => {
    expect(() =>
      quoteSelections({
        selections: [
          {
            courtId: 'missing-court',
            startsAt: new Date('2026-03-16T02:00:00Z'),
            endsAt: new Date('2026-03-16T03:00:00Z'),
          },
        ],
        courts,
        rules: [],
        timeZone: MANILA,
        tier: 'standard',
      }),
    ).toThrow(/unknown court/i)
  })

  it('returns an empty list for no selections', () => {
    expect(
      quoteSelections({ selections: [], courts, rules: [], timeZone: MANILA, tier: 'standard' }),
    ).toEqual([])
  })

  it('preserves the requested window on each priced selection', () => {
    const quoted = quoteSelections({
      selections: [
        {
          courtId: COURT_A,
          startsAt: new Date('2026-03-16T02:00:00Z'),
          endsAt: new Date('2026-03-16T03:30:00Z'),
        },
      ],
      courts,
      rules: [],
      timeZone: MANILA,
      tier: 'standard',
    })

    expect(quoted[0].startsAt.toISOString()).toBe('2026-03-16T02:00:00.000Z')
    expect(quoted[0].endsAt.toISOString()).toBe('2026-03-16T03:30:00.000Z')
    expect(quoted[0].priceCents).toBe(90000)
  })
})
