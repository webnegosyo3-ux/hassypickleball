import { describe, expect, it } from 'vitest'
import {
  parseAvailabilityPayload,
  serialiseSlot,
  toSlot,
  type SerialisedSlot,
} from './availability-payload'
import type { AvailabilitySlot } from '@/lib/services/availability'

const SLOT: AvailabilitySlot = {
  startsAt: new Date('2026-09-27T02:00:00.000Z'),
  endsAt: new Date('2026-09-27T03:00:00.000Z'),
  priceCents: 90_000,
  isAvailable: true,
  isBlocked: false,
  isPast: false,
}

describe('serialiseSlot', () => {
  it('turns the window into ISO strings so it survives JSON', () => {
    expect(serialiseSlot(SLOT)).toEqual({
      startsAt: '2026-09-27T02:00:00.000Z',
      endsAt: '2026-09-27T03:00:00.000Z',
      priceCents: 90_000,
      isAvailable: true,
      isBlocked: false,
      isPast: false,
    })
  })
})

describe('toSlot', () => {
  it('revives the window as dates without moving it', () => {
    const revived = toSlot(serialiseSlot(SLOT))

    expect(revived.startsAt.toISOString()).toBe(SLOT.startsAt.toISOString())
    expect(revived.endsAt.toISOString()).toBe(SLOT.endsAt.toISOString())
    expect(revived.isAvailable).toBe(true)
  })
})

describe('parseAvailabilityPayload', () => {
  it('reads a well-formed answer', () => {
    const parsed = parseAvailabilityPayload({
      day: '2026-09-27',
      month: '2026-09',
      durationMinutes: 60,
      slots: [serialiseSlot(SLOT)],
      days: { '2026-09-27': 12 },
      error: null,
    })

    expect(parsed?.slots).toHaveLength(1)
    expect(parsed?.days).toEqual({ '2026-09-27': 12 })
    expect(parsed?.error).toBeNull()
  })

  it('refuses anything that is not a payload', () => {
    expect(parseAvailabilityPayload(null)).toBeNull()
    expect(parseAvailabilityPayload('nope')).toBeNull()
  })

  it('drops slot-shaped rubble instead of trusting it', () => {
    const parsed = parseAvailabilityPayload({
      day: '2026-09-27',
      slots: [{ startsAt: '2026-09-27T02:00:00.000Z' }, { nope: true }],
      days: null,
      durationMinutes: 60,
      month: null,
      error: null,
    })

    expect(parsed?.slots).toEqual([])
  })

  it('reports a missing count map as unknown rather than as zero free', () => {
    const parsed = parseAvailabilityPayload({
      day: '2026-09-27',
      month: null,
      durationMinutes: 60,
      slots: [] as SerialisedSlot[],
      days: null,
      error: 'Times could not be loaded.',
    })

    expect(parsed?.days).toBeNull()
    expect(parsed?.error).toBe('Times could not be loaded.')
  })
})
