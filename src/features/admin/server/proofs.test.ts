import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookingDetail } from '@/lib/repositories/bookings'
import type { Club } from '@/lib/repositories/mappers'

const getCurrentStaff = vi.fn()
const createSupabaseServerClient = vi.fn()
const loadBookingDetail = vi.fn()
const findClubById = vi.fn()
const signPaymentProofUrl = vi.fn()

vi.mock('@/lib/auth/staff', () => ({ getCurrentStaff }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient }))
vi.mock('@/lib/repositories/bookings', () => ({ loadBookingDetail }))
vi.mock('@/lib/repositories/clubs', () => ({ findClubById }))
vi.mock('@/features/checkout/server/proof-storage', () => ({ signPaymentProofUrl }))

const { loadBookingProofs } = await import('./proofs')

/**
 * The ledger's proof dialog asks the server for a signed link at the moment a
 * staff member presses the button. Two things have to hold: nothing is signed
 * unless that person has a staff session, and a proof that cannot be signed is
 * reported as unreadable rather than dropped or linked anyway.
 */

const STAFF = {
  id: 'staff-1',
  userId: 'user-1',
  clubId: 'club-1',
  role: 'staff' as const,
  fullName: 'Mika Reyes',
}

const BOOKING_ID = '11111111-1111-4111-8111-111111111111'
const CLUB = { id: 'club-1', currency: 'PHP' } as unknown as Club
const SIGNED = 'https://storage.example/proofs/signed?token=abc'

function payment(spec: {
  readonly id: string
  readonly method: 'gcash' | 'cash'
  readonly amountCents: number
  readonly proofUrl: string | null
}) {
  return {
    id: spec.id,
    bookingId: BOOKING_ID,
    method: spec.method,
    status: 'pending' as const,
    amountCents: spec.amountCents,
    externalReference: null,
    paidAt: null,
    refundedAt: null,
    proofUrl: spec.proofUrl,
  }
}

const DETAIL = {
  booking: { id: BOOKING_ID, reference: 'PB-4819', totalCents: 120000, status: 'awaiting_payment' },
  segments: [],
  items: [],
  players: [],
  payments: [
    payment({ id: 'p1', method: 'gcash', amountCents: 120000, proofUrl: 'PB-4819/proof.png' }),
    // A cash payment recorded at the desk: nothing was uploaded for it.
    payment({ id: 'p2', method: 'cash', amountCents: 50000, proofUrl: null }),
  ],
} as unknown as BookingDetail

beforeEach(() => {
  vi.clearAllMocks()
  createSupabaseServerClient.mockResolvedValue({})
  getCurrentStaff.mockResolvedValue(STAFF)
  loadBookingDetail.mockResolvedValue(DETAIL)
  findClubById.mockResolvedValue(CLUB)
  signPaymentProofUrl.mockResolvedValue({ success: true, data: SIGNED })
})

describe('loadBookingProofs', () => {
  it('refuses a caller with no staff session and signs nothing', async () => {
    getCurrentStaff.mockResolvedValue(null)

    const result = await loadBookingProofs({ bookingId: BOOKING_ID })

    expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED' })
    expect(signPaymentProofUrl).not.toHaveBeenCalled()
  })

  it('rejects a payload that does not name one booking', async () => {
    const result = await loadBookingProofs({ bookingId: 'not-a-uuid' })

    expect(result).toMatchObject({ success: false, code: 'INVALID' })
    expect(loadBookingDetail).not.toHaveBeenCalled()
  })

  it('says the booking is gone rather than opening an empty dialog', async () => {
    loadBookingDetail.mockResolvedValue(null)

    const result = await loadBookingProofs({ bookingId: BOOKING_ID })

    expect(result).toMatchObject({
      success: false,
      code: 'INVALID',
      error: 'That booking is no longer there',
    })
  })

  it('returns only the payments that carry a proof, with a signed link on each', async () => {
    const result = await loadBookingProofs({ bookingId: BOOKING_ID })

    expect(signPaymentProofUrl).toHaveBeenCalledWith('PB-4819/proof.png')
    expect(result).toMatchObject({ success: true })
    expect(result.success && result.data).toHaveLength(1)
    expect(result.success && result.data[0]).toMatchObject({
      method: 'GCash',
      status: 'awaiting',
      hasProof: true,
      proofHref: SIGNED,
    })
    expect(result.success && result.data[0].amount).toContain('1,200')
  })

  it('keeps a proof it could not sign, with the reason, so the desk knows what to fix', async () => {
    signPaymentProofUrl.mockResolvedValue({
      success: false,
      error: 'Payment proofs cannot be opened yet: SUPABASE_SERVICE_ROLE_KEY is not set.',
    })

    const result = await loadBookingProofs({ bookingId: BOOKING_ID })

    expect(result).toMatchObject({ success: true })
    expect(result.success && result.data[0]).toMatchObject({
      hasProof: true,
      proofHref: null,
      proofError: expect.stringContaining('SUPABASE_SERVICE_ROLE_KEY'),
    })
  })
})
