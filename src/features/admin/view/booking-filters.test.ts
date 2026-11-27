import { describe, expect, it } from 'vitest'
import { bookingTabs, filterBookingRows, NO_MATCH_MESSAGE } from './booking-filters'
import type { BookingRow } from './bookings'

/**
 * Finding one booking among thirty days of them. On a phone the ledger is a
 * column of cards, so scanning is not an option — the desk types the name or
 * taps what it is chasing.
 */

function row(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'b1',
    reference: 'PB-4821',
    name: 'Maya Halvorsen',
    contact: '+63 917 555 0101',
    court: 'Harbor Court',
    when: 'Tue, 04 Aug · 5:00 PM · 1 hr 30 min',
    extras: '—',
    status: 'confirmed',
    method: 'GCash',
    paymentStatus: 'paid',
    hasProof: false,
    total: '₱1,200',
    ...overrides,
  }
}

const rows: readonly BookingRow[] = [
  row(),
  row({
    id: 'b2',
    reference: 'PB-4820',
    name: 'Jun Park',
    contact: 'jun@example.com',
    court: 'Maple Court',
    status: 'awaiting_payment',
    method: 'Bank transfer',
    paymentStatus: 'awaiting',
  }),
  row({
    id: 'b3',
    reference: 'PB-4819',
    name: 'Ana Cruz',
    contact: '+63 917 555 0303',
    status: 'cancelled',
    paymentStatus: 'awaiting',
  }),
]

describe('filterBookingRows', () => {
  it('returns every booking when nothing is asked of it', () => {
    // Act
    const result = filterBookingRows(rows, { query: '', tab: 'all' })

    // Assert
    expect(result).toEqual(rows)
  })

  it('finds a booking by its reference, however it was typed', () => {
    // Act
    const result = filterBookingRows(rows, { query: 'pb-4820', tab: 'all' })

    // Assert
    expect(result.map((match) => match.id)).toEqual(['b2'])
  })

  it('finds a booking by the customer’s name', () => {
    // Act
    const result = filterBookingRows(rows, { query: 'halvorsen', tab: 'all' })

    // Assert
    expect(result.map((match) => match.id)).toEqual(['b1'])
  })

  it('finds a booking by the contact the desk would call or email', () => {
    // Act
    const byPhone = filterBookingRows(rows, { query: '555 0303', tab: 'all' })
    const byEmail = filterBookingRows(rows, { query: 'jun@example', tab: 'all' })

    // Assert
    expect(byPhone.map((match) => match.id)).toEqual(['b3'])
    expect(byEmail.map((match) => match.id)).toEqual(['b2'])
  })

  it('finds every booking on a court', () => {
    // Act
    const result = filterBookingRows(rows, { query: 'maple', tab: 'all' })

    // Assert
    expect(result.map((match) => match.id)).toEqual(['b2'])
  })

  it('ignores the whitespace around what was typed', () => {
    // Act
    const result = filterBookingRows(rows, { query: '   Jun Park  ', tab: 'all' })

    // Assert
    expect(result.map((match) => match.id)).toEqual(['b2'])
  })

  /**
   * A cancelled booking owes the club nothing, so it does not belong in the
   * list of money to chase even though its payment never landed.
   */
  it('lists only live bookings whose money has not landed under awaiting', () => {
    // Act
    const result = filterBookingRows(rows, { query: '', tab: 'awaiting' })

    // Assert
    expect(result.map((match) => match.id)).toEqual(['b2'])
  })

  it('lists the confirmed bookings on their own tab', () => {
    // Act
    const result = filterBookingRows(rows, { query: '', tab: 'confirmed' })

    // Assert
    expect(result.map((match) => match.id)).toEqual(['b1'])
  })

  it('lists the cancelled bookings on their own tab', () => {
    // Act
    const result = filterBookingRows(rows, { query: '', tab: 'cancelled' })

    // Assert
    expect(result.map((match) => match.id)).toEqual(['b3'])
  })

  it('applies the search inside the chosen tab, not instead of it', () => {
    // Act
    const result = filterBookingRows(rows, { query: 'maya', tab: 'awaiting' })

    // Assert — Maya is confirmed and paid, so the awaiting tab has no match.
    expect(result).toEqual([])
  })

  it('says nothing matched rather than leaving the desk with a blank list', () => {
    // Assert
    expect(NO_MATCH_MESSAGE).toMatch(/no bookings match/i)
  })
})

describe('bookingTabs', () => {
  it('counts what sits behind each tab, so the desk sees the workload', () => {
    // Act
    const tabs = bookingTabs(rows)

    // Assert
    expect(tabs).toEqual([
      { id: 'all', label: 'All', count: 3 },
      { id: 'awaiting', label: 'Awaiting payment', count: 1 },
      { id: 'confirmed', label: 'Confirmed', count: 1 },
      { id: 'cancelled', label: 'Cancelled', count: 1 },
    ])
  })

  it('counts nothing without pretending there is something', () => {
    // Act
    const tabs = bookingTabs([])

    // Assert
    expect(tabs.every((tab) => tab.count === 0)).toBe(true)
  })
})
