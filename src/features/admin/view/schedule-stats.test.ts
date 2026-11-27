import { describe, expect, it } from 'vitest'
import { buildScheduleStats, type ScheduleStatsInput } from './schedule-stats'
import { club, DAY, makeBlock, makeBooking, makeCourt } from '../../../../test/admin-fixtures'

const harbor = makeCourt({ id: 'court-1', name: 'Harbor Court' })
const maple = makeCourt({ id: 'court-2', name: 'Maple Court' })

/** Every case here varies the day's contents, not how the cards are requested. */
function statsOf(overrides: Partial<ScheduleStatsInput> = {}) {
  return buildScheduleStats({
    club,
    courts: [harbor],
    bookings: [],
    blocks: [],
    day: DAY,
    today: DAY,
    ...overrides,
  })
}

function statFor(label: string, stats: ReturnType<typeof buildScheduleStats>) {
  const stat = stats.find((candidate) => candidate.label === label)

  if (!stat) {
    throw new Error(`No stat card labelled "${label}"`)
  }

  return stat
}

describe('buildScheduleStats', () => {
  it('counts the day’s live bookings, ignoring cancellations', () => {
    // Arrange
    const bookings = [
      makeBooking({ id: 'b1', segments: [{ courtId: harbor.id, from: '08:00', to: '09:00' }] }),
      makeBooking({ id: 'b2', segments: [{ courtId: harbor.id, from: '09:00', to: '10:00' }] }),
      makeBooking({
        id: 'b3',
        status: 'cancelled',
        segments: [{ courtId: harbor.id, from: '10:00', to: '11:00' }],
      }),
    ]

    // Act
    const stats = statsOf({ bookings })

    // Assert
    expect(statFor('Today', stats).value).toBe('2 bookings')
  })

  it('reads utilization as booked court time over the whole day’s capacity', () => {
    // Arrange — 90 booked minutes against two courts × 900 open minutes.
    const bookings = [
      makeBooking({ segments: [{ courtId: harbor.id, from: '08:00', to: '09:30' }] }),
    ]

    // Act
    const stats = statsOf({ courts: [harbor, maple], bookings })

    // Assert — 90 / 1800 = 5%.
    expect(statFor('Utilization', stats).value).toBe('5%')
  })

  /**
   * A blocked court is not sellable time. Counting only bookings let the console
   * report 0% for a day the club had handed over to a private event.
   */
  it('counts staff holds as occupied time, not just bookings', () => {
    // Arrange — the whole court handed over for an hour, nobody booked.
    const blocks = [makeBlock({ courtId: harbor.id, kind: 'private', from: '09:00', to: '10:00' })]

    // Act
    const stats = statsOf({ blocks })

    // Assert — 60 / 900 = 7%.
    expect(statFor('Utilization', stats).value).toBe('7%')
  })

  it('counts a hold laid over a booking once, so utilization cannot exceed 100%', () => {
    // Arrange — a 3-hour booking with a 1-hour closure inside it.
    const bookings = [
      makeBooking({ segments: [{ courtId: harbor.id, from: '09:00', to: '12:00' }] }),
    ]
    const blocks = [makeBlock({ courtId: harbor.id, kind: 'closed', from: '10:00', to: '11:00' })]

    // Act
    const stats = statsOf({ bookings, blocks })

    // Assert — the union is still 180 minutes: 180 / 900 = 20%.
    expect(statFor('Utilization', stats).value).toBe('20%')
  })

  /**
   * Utilization is measured against every court's hours, so holds on separate
   * courts that happen to run at the same time still add up. Unioning the spans
   * across the whole club reported one court's worth of time for four.
   */
  it('counts a hold on each court when they run at the same hour', () => {
    // Arrange — the same private event taken on both courts.
    const blocks = [
      makeBlock({ id: 'k1', courtId: harbor.id, kind: 'private', from: '09:00', to: '10:00' }),
      makeBlock({ id: 'k2', courtId: maple.id, kind: 'private', from: '09:00', to: '10:00' }),
    ]

    // Act
    const stats = statsOf({ courts: [harbor, maple], blocks })

    // Assert — 120 held minutes of 2 × 900 = 7%, not 3%.
    expect(statFor('Utilization', stats).value).toBe('7%')
  })

  it('ignores the part of a hold that falls outside opening hours', () => {
    // Arrange — a closure from 05:00, an hour before the club opens.
    const blocks = [makeBlock({ courtId: harbor.id, kind: 'closed', from: '05:00', to: '09:00' })]

    // Act
    const stats = statsOf({ blocks })

    // Assert — only 07:00–09:00 is court time it could have sold: 120 / 900 = 13%.
    expect(statFor('Utilization', stats).value).toBe('13%')
  })

  it('reports zero utilization rather than dividing by no courts', () => {
    // Arrange — a club with no active courts is a real state during setup.
    // Act
    const stats = statsOf({ courts: [] })

    // Assert
    expect(statFor('Utilization', stats).value).toBe('0%')
  })

  it('counts how many bookings are still waiting on payment', () => {
    // Arrange
    const bookings = [
      makeBooking({
        id: 'b1',
        status: 'awaiting_payment',
        segments: [{ courtId: harbor.id, from: '08:00', to: '09:00' }],
      }),
      makeBooking({
        id: 'b2',
        status: 'pending',
        segments: [{ courtId: harbor.id, from: '09:00', to: '10:00' }],
      }),
      makeBooking({
        id: 'b3',
        status: 'confirmed',
        segments: [{ courtId: harbor.id, from: '10:00', to: '11:00' }],
      }),
    ]

    // Act
    const stats = statsOf({ bookings })

    // Assert — pending and awaiting_payment both still owe money.
    expect(statFor('Awaiting payment', stats).value).toBe('2')
  })

  it('totals the day’s revenue and calls out the share coming from add-ons', () => {
    // Arrange
    const bookings = [
      makeBooking({
        id: 'b1',
        segments: [{ courtId: harbor.id, from: '08:00', to: '09:00', priceCents: 60_000 }],
        items: [{ name: 'Flat white', unitPriceCents: 15_000, quantity: 2 }],
      }),
      makeBooking({
        id: 'b2',
        status: 'cancelled',
        segments: [{ courtId: harbor.id, from: '09:00', to: '10:00', priceCents: 99_900 }],
      }),
    ]

    // Act
    const stats = statsOf({ bookings })
    const revenue = statFor('Revenue today', stats)

    // Assert — the cancelled booking earns nothing.
    expect(revenue.value).toBe('₱900')
    expect(revenue.detail).toBe('₱300 from add-ons')
  })

  /**
   * The same cards sit above any day the desk picks. Two of them used to say
   * "today" whatever day was on screen, which read as the console being wrong
   * about the data rather than the day being different.
   */
  it('stops calling the figures "today" when another day is on screen', () => {
    // Act
    const stats = statsOf({ day: '2026-08-05' })

    // Assert
    expect(stats.map((stat) => stat.label)).toEqual([
      'Bookings',
      'Utilization',
      'Awaiting payment',
      'Revenue',
    ])
  })

  it('always returns the four cards the design lays out', () => {
    // Act
    const stats = statsOf()

    // Assert
    expect(stats.map((stat) => stat.label)).toEqual([
      'Today',
      'Utilization',
      'Awaiting payment',
      'Revenue today',
    ])
  })
})
