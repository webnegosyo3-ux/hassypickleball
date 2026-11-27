import { describe, expect, it } from 'vitest'
import { callsFor, fakeClient, fakeTable } from '../../../test/postgrest-fake'
import {
  findBookingByReference,
  listBookingsInWindow,
  loadBookingDetail,
  removeBooking,
  updateBookingStatus,
} from './bookings'

const BOOKING_ROW = {
  id: 'booking-1',
  club_id: 'club-1',
  reference: 'PB-4G6JVH',
  customer_id: 'customer-1',
  contact_name: 'Ana Cruz',
  contact_email: 'ana@example.com',
  contact_phone: null,
  status: 'confirmed' as const,
  starts_at: '2026-03-01T02:00:00.000Z',
  ends_at: '2026-03-01T03:00:00.000Z',
  courts_subtotal_cents: 60000,
  items_subtotal_cents: 0,
  total_cents: 60000,
  will_present_id: false,
  notes: null,
  confirmed_at: '2026-02-21T04:00:00.000Z',
  cancelled_at: null,
  created_at: '2026-02-20T10:00:00.000Z',
}

describe('findBookingByReference', () => {
  it('matches the reference case-insensitively so a lowercased paste still resolves', async () => {
    const bookings = fakeTable({ data: BOOKING_ROW, error: null })

    await findBookingByReference(fakeClient({ bookings }), 'pb-4g6jvh')

    expect(callsFor(bookings, 'eq')).toContainEqual({
      method: 'eq',
      args: ['reference', 'PB-4G6JVH'],
    })
  })

  it('returns null when nothing matches', async () => {
    const client = fakeClient({ bookings: fakeTable({ data: null, error: null }) })

    expect(await findBookingByReference(client, 'PB-NOPE00')).toBeNull()
  })

  it('throws with context when the query errors', async () => {
    const client = fakeClient({ bookings: fakeTable({ data: null, error: { message: 'boom' } }) })

    await expect(findBookingByReference(client, 'PB-4G6JVH')).rejects.toThrow(
      /Failed to load booking: boom/,
    )
  })
})

describe('loadBookingDetail', () => {
  it('loads the named players in their checkout order', async () => {
    const bookings = fakeTable({
      data: {
        ...BOOKING_ROW,
        booking_courts: [],
        booking_items: [],
        booking_players: [
          { id: 'player-2', name: 'Ben Uy', position: 2 },
          { id: 'player-1', name: 'Ana Cruz', position: 1 },
        ],
        payments: [],
      },
      error: null,
    })

    const detail = await loadBookingDetail(fakeClient({ bookings }), 'booking-1')
    const [select] = callsFor(bookings, 'select')

    expect(String(select?.args[0] ?? '')).toContain('booking_players')
    expect(detail?.players).toEqual(['Ana Cruz', 'Ben Uy'])
  })

  it('joins segments, items and payments in a single query rather than N+1', async () => {
    const bookings = fakeTable({
      data: {
        ...BOOKING_ROW,
        booking_courts: [],
        booking_items: [],
        payments: [],
      },
      error: null,
    })

    await loadBookingDetail(fakeClient({ bookings }), 'booking-1')

    const [select] = callsFor(bookings, 'select')
    const columns = String(select?.args[0] ?? '')

    expect(columns).toContain('booking_courts')
    expect(columns).toContain('booking_items')
    expect(columns).toContain('payments')
  })

  it('selects the payment proof path, which the console signs a link from', async () => {
    const bookings = fakeTable({
      data: { ...BOOKING_ROW, booking_courts: [], booking_items: [], payments: [] },
      error: null,
    })

    await loadBookingDetail(fakeClient({ bookings }), 'booking-1')

    const [select] = callsFor(bookings, 'select')

    expect(String(select?.args[0] ?? '')).toContain('proof_url')
  })

  it('maps every related collection onto the detail', async () => {
    const bookings = fakeTable({
      data: {
        ...BOOKING_ROW,
        booking_courts: [
          {
            id: 'segment-1',
            court_id: 'court-1',
            status: 'confirmed',
            starts_at: '2026-03-01T02:00:00.000Z',
            ends_at: '2026-03-01T03:00:00.000Z',
            price_cents: 60000,
            courts: { name: 'Court 3' },
          },
        ],
        booking_items: [
          {
            id: 'item-1',
            product_id: 'product-1',
            name_snapshot: 'Paddle rental',
            unit_price_cents: 20000,
            quantity: 2,
            line_total_cents: 40000,
          },
        ],
        payments: [
          {
            id: 'payment-1',
            booking_id: 'booking-1',
            method: 'gcash',
            status: 'paid',
            amount_cents: 60000,
            external_reference: null,
            paid_at: '2026-02-21T04:00:00.000Z',
            refunded_at: null,
          },
        ],
      },
      error: null,
    })

    const detail = await loadBookingDetail(fakeClient({ bookings }), 'booking-1')

    expect(detail?.booking.reference).toBe('PB-4G6JVH')
    expect(detail?.segments[0]?.courtName).toBe('Court 3')
    expect(detail?.items[0]?.name).toBe('Paddle rental')
    expect(detail?.payments[0]?.method).toBe('gcash')
  })

  it('returns empty collections when a booking has no items or payments yet', async () => {
    const bookings = fakeTable({
      data: { ...BOOKING_ROW, booking_courts: null, booking_items: null, payments: null },
      error: null,
    })

    const detail = await loadBookingDetail(fakeClient({ bookings }), 'booking-1')

    expect(detail?.items).toEqual([])
    expect(detail?.payments).toEqual([])
    expect(detail?.segments).toEqual([])
  })

  it('returns null when the booking does not exist', async () => {
    const client = fakeClient({ bookings: fakeTable({ data: null, error: null }) })

    expect(await loadBookingDetail(client, 'missing')).toBeNull()
  })
})

describe('listBookingsInWindow', () => {
  const window = {
    clubId: 'club-1',
    from: new Date('2026-03-01T00:00:00.000Z'),
    to: new Date('2026-03-02T00:00:00.000Z'),
  }

  it('uses a half-open window so a booking ending exactly at `from` is excluded', async () => {
    const bookings = fakeTable({ data: [], error: null })

    await listBookingsInWindow(fakeClient({ bookings }), window)

    expect(bookings.calls).toContainEqual({
      method: 'lt',
      args: ['starts_at', window.to.toISOString()],
    })
    expect(bookings.calls).toContainEqual({
      method: 'gt',
      args: ['ends_at', window.from.toISOString()],
    })
  })

  it('scopes to the club so one club can never read another club’s bookings', async () => {
    const bookings = fakeTable({ data: [], error: null })

    await listBookingsInWindow(fakeClient({ bookings }), window)

    expect(bookings.calls).toContainEqual({ method: 'eq', args: ['club_id', 'club-1'] })
  })

  it('filters by status only when one is asked for', async () => {
    const unfiltered = fakeTable({ data: [], error: null })
    await listBookingsInWindow(fakeClient({ bookings: unfiltered }), window)

    expect(callsFor(unfiltered, 'in')).toHaveLength(0)

    const filtered = fakeTable({ data: [], error: null })
    await listBookingsInWindow(fakeClient({ bookings: filtered }), {
      ...window,
      statuses: ['confirmed', 'completed'],
    })

    expect(filtered.calls).toContainEqual({
      method: 'in',
      args: ['status', ['confirmed', 'completed']],
    })
  })

  it('orders by start time so the schedule renders chronologically', async () => {
    const bookings = fakeTable({ data: [], error: null })

    await listBookingsInWindow(fakeClient({ bookings }), window)

    expect(bookings.calls).toContainEqual({
      method: 'order',
      args: ['starts_at', { ascending: true }],
    })
  })

  it('returns an empty list rather than null when nothing is booked', async () => {
    const client = fakeClient({ bookings: fakeTable({ data: null, error: null }) })

    expect(await listBookingsInWindow(client, window)).toEqual([])
  })

  it('throws with context when the query errors', async () => {
    const client = fakeClient({ bookings: fakeTable({ data: null, error: { message: 'down' } }) })

    await expect(listBookingsInWindow(client, window)).rejects.toThrow(
      /Failed to load bookings: down/,
    )
  })
})

describe('updateBookingStatus', () => {
  it('writes the new status for exactly one booking', async () => {
    const bookings = fakeTable({ data: { ...BOOKING_ROW, status: 'cancelled' }, error: null })

    await updateBookingStatus(fakeClient({ bookings }), 'booking-1', 'cancelled')

    expect(callsFor(bookings, 'update')[0]?.args[0]).toMatchObject({ status: 'cancelled' })
    expect(bookings.calls).toContainEqual({ method: 'eq', args: ['id', 'booking-1'] })
  })

  it('stamps confirmed_at when a booking is confirmed', async () => {
    const bookings = fakeTable({ data: BOOKING_ROW, error: null })

    await updateBookingStatus(fakeClient({ bookings }), 'booking-1', 'confirmed')

    const patch = callsFor(bookings, 'update')[0]?.args[0] as Record<string, unknown>

    expect(patch.confirmed_at).toEqual(expect.any(String))
  })

  it('stamps cancelled_at when a booking is cancelled', async () => {
    const bookings = fakeTable({ data: BOOKING_ROW, error: null })

    await updateBookingStatus(fakeClient({ bookings }), 'booking-1', 'cancelled')

    const patch = callsFor(bookings, 'update')[0]?.args[0] as Record<string, unknown>

    expect(patch.cancelled_at).toEqual(expect.any(String))
  })

  it('throws with context when the write is rejected', async () => {
    const client = fakeClient({ bookings: fakeTable({ data: null, error: { message: 'denied' } }) })

    await expect(updateBookingStatus(client, 'booking-1', 'confirmed')).rejects.toThrow(
      /Failed to update booking: denied/,
    )
  })
})

/**
 * Deleting the row is the whole statement: the court holds, items, players and
 * payments are foreign keys with `on delete cascade`, so nothing else has to be
 * spelled out here — and nothing may be, or a half-delete becomes possible.
 */
describe('removeBooking', () => {
  it('deletes exactly one booking, inside the club it was asked about', async () => {
    const bookings = fakeTable({ data: null, error: null })

    await removeBooking(fakeClient({ bookings }), 'club-1', 'booking-1')

    expect(callsFor(bookings, 'delete')).toHaveLength(1)
    expect(bookings.calls).toContainEqual({ method: 'eq', args: ['id', 'booking-1'] })
    expect(bookings.calls).toContainEqual({ method: 'eq', args: ['club_id', 'club-1'] })
  })

  it('throws with context when the delete is rejected', async () => {
    const client = fakeClient({ bookings: fakeTable({ data: null, error: { message: 'denied' } }) })

    await expect(removeBooking(client, 'club-1', 'booking-1')).rejects.toThrow(
      /Failed to delete booking: denied/,
    )
  })
})
