import 'server-only'

import { toBooking, toBookingItemLine, toBookingSegment, toPayment } from './booking-mappers'
import type { Booking, BookingItemLine, BookingSegment, Payment } from './booking-mappers'
import { MAX_ROWS, raise, type Client } from './support'
import type { BookingStatus } from '@/lib/domain/types'

/** Reads and status writes for bookings. Pricing lives in the database RPC. */

export type BookingDetail = {
  readonly booking: Booking
  readonly segments: readonly BookingSegment[]
  readonly items: readonly BookingItemLine[]
  readonly players: readonly string[]
  readonly payments: readonly Payment[]
}

export type BookingWindow = {
  readonly clubId: string
  readonly from: Date
  readonly to: Date
  readonly statuses?: readonly BookingStatus[]
}

/** Every related record in one round trip — the admin screens show them together. */
const DETAIL_COLUMNS = `
  *,
  booking_courts (id, court_id, status, starts_at, ends_at, price_cents, courts (name)),
  booking_items (id, product_id, name_snapshot, unit_price_cents, quantity, line_total_cents),
  booking_players (id, name, position),
  payments (id, booking_id, method, status, amount_cents, external_reference, paid_at, refunded_at, proof_url)
`

type DetailRow = Parameters<typeof toBooking>[0] & {
  booking_courts: Parameters<typeof toBookingSegment>[0][] | null
  booking_items: Parameters<typeof toBookingItemLine>[0][] | null
  booking_players: { id: string; name: string; position: number }[] | null
  payments: Parameters<typeof toPayment>[0][] | null
}

function toDetail(row: DetailRow): BookingDetail {
  return {
    booking: toBooking(row),
    segments: (row.booking_courts ?? []).map(toBookingSegment),
    items: (row.booking_items ?? []).map(toBookingItemLine),
    players: [...(row.booking_players ?? [])]
      .sort((left, right) => left.position - right.position)
      .map((player) => player.name),
    payments: (row.payments ?? []).map(toPayment),
  }
}

/**
 * Staff-side lookup by reference. References are generated uppercase, so the
 * input is normalised rather than matched with a case-insensitive operator that
 * could not use the unique index.
 */
export async function findBookingByReference(
  client: Client,
  reference: string,
): Promise<Booking | null> {
  const { data, error } = await client
    .from('bookings')
    .select('*')
    .eq('reference', reference.trim().toUpperCase())
    .maybeSingle()

  raise('Failed to load booking', error)

  return data ? toBooking(data) : null
}

export async function loadBookingDetail(
  client: Client,
  bookingId: string,
): Promise<BookingDetail | null> {
  const { data, error } = await client
    .from('bookings')
    .select(DETAIL_COLUMNS)
    .eq('id', bookingId)
    .maybeSingle()

  raise('Failed to load booking', error)

  return data ? toDetail(data as unknown as DetailRow) : null
}

/**
 * Bookings overlapping a window, with their segments and items. The window is
 * half-open, matching the exclusion constraint: a booking that ends exactly at
 * `from` does not belong to it.
 */
export async function listBookingsInWindow(
  client: Client,
  window: BookingWindow,
): Promise<readonly BookingDetail[]> {
  let query = client
    .from('bookings')
    .select(DETAIL_COLUMNS)
    .eq('club_id', window.clubId)
    .lt('starts_at', window.to.toISOString())
    .gt('ends_at', window.from.toISOString())

  if (window.statuses && window.statuses.length > 0) {
    query = query.in('status', [...window.statuses])
  }

  const { data, error } = await query.order('starts_at', { ascending: true }).limit(MAX_ROWS)

  raise('Failed to load bookings', error)

  return ((data ?? []) as unknown as DetailRow[]).map(toDetail)
}

/**
 * Status transitions. `bookings_sync_court_status` propagates the new status to
 * booking_courts, which is what actually frees or holds the slot.
 */
export async function updateBookingStatus(
  client: Client,
  bookingId: string,
  status: BookingStatus,
): Promise<Booking> {
  const now = new Date().toISOString()

  const patch = {
    status,
    ...(status === 'confirmed' ? { confirmed_at: now } : {}),
    ...(status === 'cancelled' ? { cancelled_at: now } : {}),
  }

  const { data, error } = await client
    .from('bookings')
    .update(patch)
    .eq('id', bookingId)
    .select('*')
    .single()

  raise('Failed to update booking', error)

  return toBooking(data as NonNullable<typeof data>)
}

/**
 * Erase a booking.
 *
 * Court holds, items, players and payments are `on delete cascade`, and
 * `bookings_sync_customer_rollups` fires on delete, so the customer's totals
 * and the court's availability correct themselves in the same statement. The
 * club filter is belt and braces: RLS already decides what staff can reach.
 */
export async function removeBooking(
  client: Client,
  clubId: string,
  bookingId: string,
): Promise<void> {
  const { error } = await client.from('bookings').delete().eq('id', bookingId).eq('club_id', clubId)

  raise('Failed to delete booking', error)
}
