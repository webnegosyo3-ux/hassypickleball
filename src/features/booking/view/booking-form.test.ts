import { describe, expect, it } from 'vitest'
import { buildBookingFormOrder, buildBookingFormSummary, guestContactEmail } from './booking-form'
import type { BookableAddon } from './booking-form'
import type { CapacityBand } from '@/lib/domain/pax'
import type { AvailabilitySlot } from '@/lib/services/availability'

function slot(overrides: Partial<AvailabilitySlot> = {}): AvailabilitySlot {
  return {
    startsAt: new Date('2026-09-27T02:00:00.000Z'),
    endsAt: new Date('2026-09-27T03:00:00.000Z'),
    priceCents: 90_000,
    isAvailable: true,
    isBlocked: false,
    isPast: false,
    ...overrides,
  }
}

const ADDON: BookableAddon = {
  id: 'paddle-rental',
  name: 'Paddle rental',
  description: null,
  priceCents: 15_000,
}

const BAND: CapacityBand = {
  minPlayers: 2,
  includedPlayers: 4,
  maxPlayers: 8,
  extraPlayerFeeCents: 5_000,
}

const CONTACT = {
  contactName: '  Ana Cruz ',
  contactPhone: ' 0917 000 0000 ',
  notes: '   ',
  willPresentId: true,
}

describe('guestContactEmail', () => {
  it('keys the placeholder address on the digits of the phone number', () => {
    expect(guestContactEmail(' 0917 000 0000 ')).toBe('09170000000@guest.invalid')
  })

  it('still produces a usable address when no phone number was given', () => {
    expect(guestContactEmail('')).toBe('walk-in@guest.invalid')
  })
})

describe('buildBookingFormOrder', () => {
  it('sends the chosen window and the details as typed', () => {
    const order = buildBookingFormOrder({
      clubId: 'club-1',
      courtId: 'court-1',
      slot: slot(),
      contact: CONTACT,
      addonIds: [],
      players: [],
      paymentMethodId: 'gcash',
    })

    expect(order).toMatchObject({
      clubId: 'club-1',
      contactName: 'Ana Cruz',
      contactEmail: '09170000000@guest.invalid',
      contactPhone: '0917 000 0000',
      willPresentId: true,
      paymentMethodId: 'gcash',
      courts: [
        {
          courtId: 'court-1',
          startsAt: '2026-09-27T02:00:00.000Z',
          endsAt: '2026-09-27T03:00:00.000Z',
        },
      ],
    })
  })

  it('carries no price for the server to trust', () => {
    const order = buildBookingFormOrder({
      clubId: 'club-1',
      courtId: 'court-1',
      slot: slot(),
      contact: CONTACT,
      addonIds: [],
      players: [],
      paymentMethodId: 'gcash',
    })

    expect(JSON.stringify(order)).not.toContain('90000')
  })

  it('waits for a slot and a payment method before it builds anything', () => {
    const base = {
      clubId: 'club-1',
      courtId: 'court-1',
      contact: CONTACT,
      addonIds: [],
      players: [],
    }

    expect(buildBookingFormOrder({ ...base, slot: null, paymentMethodId: 'gcash' })).toBeNull()
    expect(buildBookingFormOrder({ ...base, slot: slot(), paymentMethodId: null })).toBeNull()
  })

  it('sends blank player rows nowhere and keeps the named ones in order', () => {
    const order = buildBookingFormOrder({
      clubId: 'club-1',
      courtId: 'court-1',
      slot: slot(),
      contact: CONTACT,
      addonIds: [],
      players: ['  Ana ', '', '   ', 'Bea'],
      paymentMethodId: 'gcash',
    })

    expect(order?.players).toEqual(['Ana', 'Bea'])
  })

  it('sends each ticked extra as one item', () => {
    const order = buildBookingFormOrder({
      clubId: 'club-1',
      courtId: 'court-1',
      slot: slot(),
      contact: CONTACT,
      addonIds: ['paddle-rental', 'iced-tea'],
      players: [],
      paymentMethodId: 'gcash',
    })

    expect(order?.items).toEqual([
      { productId: 'paddle-rental', quantity: 1 },
      { productId: 'iced-tea', quantity: 1 },
    ])
  })

  it('sends null rather than an empty note', () => {
    const order = buildBookingFormOrder({
      clubId: 'club-1',
      courtId: 'court-1',
      slot: slot(),
      contact: CONTACT,
      addonIds: [],
      players: [],
      paymentMethodId: 'gcash',
    })

    expect(order?.notes).toBeNull()
  })
})

describe('buildBookingFormSummary', () => {
  it('prices the session, the extras and the heads beyond the included count', () => {
    const summary = buildBookingFormSummary({
      courtName: 'Court 1',
      durationMinutes: 60,
      slotPriceCents: 90_000,
      addons: [ADDON],
      addonIds: ['paddle-rental'],
      partySize: 6,
      band: BAND,
      currency: 'PHP',
    })

    expect(summary.hasSlot).toBe(true)
    expect(summary.extraPlayers).toBe(2)
    expect(summary.extraPlayersCents).toBe(10_000)
    expect(summary.totalCents).toBe(90_000 + 15_000 + 10_000)
    expect(summary.lines.map((line) => line.label)).toEqual([
      'Court 1 · 1 hr',
      'Paddle rental',
      'Extra players × 2',
    ])
  })

  it('leaves the extra-player line off while the party fits the slot price', () => {
    const summary = buildBookingFormSummary({
      courtName: 'Court 1',
      durationMinutes: 60,
      slotPriceCents: 90_000,
      addons: [],
      addonIds: [],
      partySize: 4,
      band: BAND,
      currency: 'PHP',
    })

    expect(summary.extraPlayers).toBe(0)
    expect(summary.extraPlayersCents).toBe(0)
    expect(summary.totalCents).toBe(90_000)
    expect(summary.lines).toHaveLength(1)
  })

  it('has nothing to total until a start time is picked', () => {
    const summary = buildBookingFormSummary({
      courtName: 'Court 1',
      durationMinutes: 60,
      slotPriceCents: null,
      addons: [ADDON],
      addonIds: ['paddle-rental'],
      partySize: 0,
      band: BAND,
      currency: 'PHP',
    })

    expect(summary.hasSlot).toBe(false)
    // The extras still add up: the customer should see what their ticks cost
    // even before they have chosen when to play.
    expect(summary.totalCents).toBe(15_000)
  })
})
