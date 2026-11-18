import { describe, expect, it } from 'vitest'
import { quoteCourtSegment, ruleApplies } from './pricing'
import type { PricingRule } from './types'

const MANILA = 'Asia/Manila'
const HOURLY_RATE = 60000 // ₱600.00

function rule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: 'rule-1',
    label: 'Test rule',
    courtId: null,
    daysOfWeek: [],
    startsAtTime: null,
    endsAtTime: null,
    minDurationMinutes: null,
    appliesToTier: null,
    kind: 'percent_delta',
    valueCents: null,
    valuePercent: 10,
    priority: 0,
    isActive: true,
    ...overrides,
  }
}

// Monday 2026-03-16, 10:00 Manila.
const MONDAY_10AM = new Date('2026-03-16T02:00:00Z')
// Sunday 2026-03-15, 10:00 Manila.
const SUNDAY_10AM = new Date('2026-03-15T02:00:00Z')

describe('ruleApplies', () => {
  const context = {
    courtId: 'court-1',
    startsAt: MONDAY_10AM,
    durationMinutes: 60,
    timeZone: MANILA,
    tier: 'standard' as const,
  }

  it('applies a club-wide rule with no constraints', () => {
    expect(ruleApplies(rule(), context)).toBe(true)
  })

  it('applies a court-scoped rule only to that court', () => {
    expect(ruleApplies(rule({ courtId: 'court-1' }), context)).toBe(true)
    expect(ruleApplies(rule({ courtId: 'court-2' }), context)).toBe(false)
  })

  it('matches the club-local day of week, not UTC', () => {
    // Sunday 06:30 Manila is still Saturday in UTC.
    const sundayEarly = { ...context, startsAt: new Date('2026-03-14T22:30:00Z') }

    expect(ruleApplies(rule({ daysOfWeek: [0] }), sundayEarly)).toBe(true)
    expect(ruleApplies(rule({ daysOfWeek: [6] }), sundayEarly)).toBe(false)
  })

  it('matches a club-local time window on its half-open bounds', () => {
    const window = rule({ startsAtTime: '10:00', endsAtTime: '16:00' })

    expect(ruleApplies(window, context)).toBe(true)
    expect(ruleApplies(window, { ...context, startsAt: new Date('2026-03-16T08:00:00Z') })).toBe(
      false,
    )
  })

  it('respects a minimum duration', () => {
    const longOnly = rule({ minDurationMinutes: 120 })

    expect(ruleApplies(longOnly, context)).toBe(false)
    expect(ruleApplies(longOnly, { ...context, durationMinutes: 120 })).toBe(true)
  })

  it('respects a customer tier restriction', () => {
    const proOnly = rule({ appliesToTier: 'pro' })

    expect(ruleApplies(proOnly, context)).toBe(false)
    expect(ruleApplies(proOnly, { ...context, tier: 'pro' })).toBe(true)
  })
})

describe('quoteCourtSegment', () => {
  const base = {
    basePriceCents: HOURLY_RATE,
    courtId: 'court-1',
    startsAt: MONDAY_10AM,
    durationMinutes: 60,
    timeZone: MANILA,
    tier: 'standard' as const,
  }

  it('charges the base hourly rate when no rules match', () => {
    const quote = quoteCourtSegment({ ...base, rules: [] })

    expect(quote.totalCents).toBe(60000)
    expect(quote.appliedRules).toEqual([])
  })

  it('prorates the hourly rate for a 90-minute session', () => {
    const quote = quoteCourtSegment({ ...base, durationMinutes: 90, rules: [] })

    expect(quote.totalCents).toBe(90000)
  })

  it('applies a percentage surcharge to the hourly rate', () => {
    const quote = quoteCourtSegment({
      ...base,
      startsAt: SUNDAY_10AM,
      rules: [rule({ daysOfWeek: [0], valuePercent: 25 })],
    })

    expect(quote.totalCents).toBe(75000)
    expect(quote.appliedRules.map((r) => r.id)).toEqual(['rule-1'])
  })

  it('applies a percentage discount', () => {
    const quote = quoteCourtSegment({
      ...base,
      rules: [rule({ valuePercent: -20 })],
    })

    expect(quote.totalCents).toBe(48000)
  })

  it('replaces the rate entirely for a fixed rule', () => {
    const quote = quoteCourtSegment({
      ...base,
      rules: [rule({ kind: 'fixed', valuePercent: null, valueCents: 40000 })],
    })

    expect(quote.totalCents).toBe(40000)
  })

  it('adds a flat amount to the hourly rate', () => {
    const quote = quoteCourtSegment({
      ...base,
      rules: [rule({ kind: 'amount_delta', valuePercent: null, valueCents: 5000 })],
    })

    expect(quote.totalCents).toBe(65000)
  })

  it('stacks rules in priority order, lowest first', () => {
    const quote = quoteCourtSegment({
      ...base,
      rules: [
        rule({
          id: 'late',
          priority: 20,
          kind: 'amount_delta',
          valuePercent: null,
          valueCents: 10000,
        }),
        rule({ id: 'early', priority: 10, valuePercent: 50 }),
      ],
    })

    // 600 -> +50% = 900 -> +100 = 1000
    expect(quote.totalCents).toBe(100000)
    expect(quote.appliedRules.map((r) => r.id)).toEqual(['early', 'late'])
  })

  it('ignores rules that do not match the segment', () => {
    const quote = quoteCourtSegment({
      ...base,
      rules: [rule({ daysOfWeek: [0], valuePercent: 25 })],
    })

    expect(quote.totalCents).toBe(60000)
    expect(quote.appliedRules).toEqual([])
  })

  it('never quotes a negative price', () => {
    const quote = quoteCourtSegment({
      ...base,
      rules: [rule({ kind: 'amount_delta', valuePercent: null, valueCents: -999999 })],
    })

    expect(quote.totalCents).toBe(0)
  })

  it('rounds to whole cents', () => {
    const quote = quoteCourtSegment({
      ...base,
      basePriceCents: 33333,
      durationMinutes: 90,
      rules: [],
    })

    expect(quote.totalCents).toBe(50000)
    expect(Number.isInteger(quote.totalCents)).toBe(true)
  })

  it('rejects a non-positive duration', () => {
    expect(() => quoteCourtSegment({ ...base, durationMinutes: 0, rules: [] })).toThrow(
      /durationMinutes/i,
    )
  })
})
