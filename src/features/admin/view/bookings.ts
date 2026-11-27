import { durationMinutes } from '@/lib/domain/time'
import { nextStatuses } from '@/lib/domain/booking-status'
import { formatMinutes, formatMoney } from '@/lib/format/money'
import { formatDayInZone, formatTimeInZone } from '@/lib/format/time'
import type { BookingItemLine, Payment } from '@/lib/repositories/booking-mappers'
import type { BookingDetail } from '@/lib/repositories/bookings'
import type { Club } from '@/lib/repositories/mappers'
import type { Enums } from '@/lib/repositories/rows'
import type { BookingStatus } from '@/lib/domain/types'

/**
 * The admin Bookings ledger and the detail panel beside it.
 *
 * This module carries both the session and the money, because they belong to
 * one row and the desk reconciles them together. Payment status is kept
 * separate from booking status rather than folded into it: a confirmed booking
 * with an unsettled bank transfer still owes the club, and collapsing the two
 * would hide exactly the case staff need to chase.
 */

/** How the money on a booking reads, independent of the booking's own status. */
export type PaymentStatus = 'paid' | 'awaiting' | 'refunded' | 'failed'

export type BookingRow = {
  readonly id: string
  readonly reference: string
  readonly name: string
  readonly contact: string
  readonly court: string
  readonly when: string
  readonly extras: string
  readonly status: BookingStatus
  readonly method: string
  readonly paymentStatus: PaymentStatus
  /** Whether a guest uploaded a proof for any payment, so the list can say so. */
  readonly hasProof: boolean
  readonly total: string
}

export type DetailLine = {
  readonly label: string
  readonly value: string
}

export type PaymentLine = {
  readonly id: string
  readonly method: string
  readonly status: PaymentStatus
  readonly amount: string
  /**
   * Whether the guest uploaded a proof, whether or not it could be opened.
   * Kept apart from `proofHref` so the console can tell "no proof" from
   * "a proof we could not sign a link to" instead of showing silence for both.
   */
  readonly hasProof: boolean
  /** A signed, time-boxed link to the guest's uploaded proof, when there is one. */
  readonly proofHref: string | null
  /**
   * Why that link is missing, when one was expected: the storage secret is
   * unset, the bucket is gone, or the object itself is. The desk reads this,
   * so it has to say which — "check the storage key" for all three sent people
   * looking in the wrong place.
   */
  readonly proofError: string | null
}

export type BookingDetailView = {
  readonly id: string
  readonly reference: string
  readonly status: BookingStatus
  readonly paymentStatus: PaymentStatus
  readonly meta: readonly DetailLine[]
  readonly players: readonly string[]
  readonly lines: readonly DetailLine[]
  readonly total: string
  readonly note: string
  readonly payments: readonly PaymentLine[]
  /** Where the desk can move this booking. Empty once it is cancelled or done. */
  readonly nextStatuses: readonly BookingStatus[]
  /** Defaults the record-payment amount, so staff do not retype the balance. */
  readonly outstandingCents: number
}

/** Proof storage path -> signed URL. The page signs; this module only renders. */
export type SignedProofUrls = Readonly<Record<string, string>>

/** Proof storage path -> why it could not be signed. */
export type ProofFailures = Readonly<Record<string, string>>

/**
 * What signing produced for one booking: the links that worked and the reasons
 * the rest did not. Signing is not all-or-nothing — one unreadable proof must
 * not hide the readable ones beside it.
 */
export type ProofLookup = {
  readonly urls: SignedProofUrls
  readonly failures: ProofFailures
}

/** Signing nothing: the shape a booking with no proofs is described with. */
export const NO_PROOFS: ProofLookup = { urls: {}, failures: {} }

const UNOPENABLE = 'That proof could not be opened.'

const METHOD_LABELS: Record<Enums['payment_method'], string> = {
  cash: 'Cash',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  gcash: 'GCash',
  online: 'Online',
}

const PAYMENT_STATUS: Record<Enums['payment_status'], PaymentStatus> = {
  paid: 'paid',
  pending: 'awaiting',
  refunded: 'refunded',
  failed: 'failed',
}

const NOTHING = '—'
const NO_METHOD = 'Not recorded'
const NO_NOTE = 'No note on this booking.'

/**
 * The payment that decides how the money reads.
 *
 * A refund is the later and truer fact about money that was once paid, so it
 * wins over the successful charge that preceded it; otherwise the most
 * recently recorded payment stands.
 */
function decidingPayment(payments: readonly Payment[]): Payment | undefined {
  return payments.find((payment) => payment.status === 'refunded') ?? payments.at(-1)
}

function paymentStatusOf(payments: readonly Payment[]): PaymentStatus {
  const payment = decidingPayment(payments)

  return payment ? PAYMENT_STATUS[payment.status] : 'awaiting'
}

function methodOf(payments: readonly Payment[]): string {
  const payment = decidingPayment(payments)

  return payment ? METHOD_LABELS[payment.method] : NO_METHOD
}

/** A quantity of one is implied; printing "×1" on every line is noise. */
function describeItem(item: BookingItemLine): string {
  return item.quantity > 1 ? `${item.name} ×${item.quantity}` : item.name
}

function courtNames(detail: BookingDetail): readonly string[] {
  return [
    ...new Set(
      detail.segments.flatMap((segment) => (segment.courtName ? [segment.courtName] : [])),
    ),
  ]
}

function courtLabel(detail: BookingDetail): string {
  const names = courtNames(detail)

  return names.length > 0 ? names.join(', ') : NOTHING
}

function extras(detail: BookingDetail): string {
  return detail.items.length > 0 ? detail.items.map(describeItem).join(', ') : NOTHING
}

function whenLabel(detail: BookingDetail, club: Club): string {
  const { booking } = detail
  const minutes = durationMinutes({ startsAt: booking.startsAt, endsAt: booking.endsAt })

  return [
    formatDayInZone(booking.startsAt, club.timeZone),
    formatTimeInZone(booking.startsAt, club.timeZone),
    formatMinutes(minutes),
  ].join(' · ')
}

/**
 * What the booking still owes.
 *
 * Only settled money counts against the total: a failed charge collected
 * nothing, and a refund gave back what it had. Clamped at zero so an overpaid
 * booking does not offer the desk a negative amount to record.
 */
function outstandingCents(detail: BookingDetail): number {
  const settled = detail.payments
    .filter((payment) => payment.status === 'paid')
    .reduce((sum, payment) => sum + payment.amountCents, 0)

  const returned = detail.payments
    .filter((payment) => payment.status === 'refunded')
    .reduce((sum, payment) => sum + payment.amountCents, 0)

  return Math.max(0, detail.booking.totalCents - settled + returned)
}

function toPaymentLine(payment: Payment, club: Club, proofs: ProofLookup): PaymentLine {
  // An unsigned path stays unlinked: a link that 403s is worse than none.
  const href = payment.proofUrl ? (proofs.urls[payment.proofUrl] ?? null) : null

  return {
    id: payment.id,
    method: METHOD_LABELS[payment.method],
    status: PAYMENT_STATUS[payment.status],
    amount: formatMoney(payment.amountCents, club.currency),
    hasProof: Boolean(payment.proofUrl),
    proofHref: href,
    proofError:
      payment.proofUrl && href === null ? (proofs.failures[payment.proofUrl] ?? UNOPENABLE) : null,
  }
}

export function toBookingRows(
  bookings: readonly BookingDetail[],
  club: Club,
): readonly BookingRow[] {
  return bookings.map((detail) => {
    const { booking } = detail

    return {
      id: booking.id,
      reference: booking.reference,
      name: booking.contactName,
      // A phone number is what the desk actually uses to chase someone.
      contact: booking.contactPhone ?? booking.contactEmail,
      court: courtLabel(detail),
      when: whenLabel(detail, club),
      extras: extras(detail),
      // The badge component owns the wording; the raw status crosses unchanged.
      status: booking.status,
      method: methodOf(detail.payments),
      paymentStatus: paymentStatusOf(detail.payments),
      hasProof: detail.payments.some((payment) => Boolean(payment.proofUrl)),
      total: formatMoney(booking.totalCents, club.currency),
    }
  })
}

export function toBookingDetailView(
  detail: BookingDetail,
  club: Club,
  proofs: ProofLookup = NO_PROOFS,
): BookingDetailView {
  const { booking } = detail

  return {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    paymentStatus: paymentStatusOf(detail.payments),
    meta: [
      { label: 'Customer', value: booking.contactName },
      { label: 'Contact', value: booking.contactPhone ?? booking.contactEmail },
      { label: 'Court', value: courtLabel(detail) },
      { label: 'When', value: whenLabel(detail, club) },
    ],
    players: detail.players,
    lines: [
      { label: 'Court time', value: formatMoney(booking.courtsSubtotalCents, club.currency) },
      ...detail.items.map((item) => ({
        label: describeItem(item),
        value: formatMoney(item.lineTotalCents, club.currency),
      })),
    ],
    total: formatMoney(booking.totalCents, club.currency),
    note: booking.notes ?? NO_NOTE,
    payments: detail.payments.map((payment) => toPaymentLine(payment, club, proofs)),
    nextStatuses: nextStatuses(booking.status),
    outstandingCents: outstandingCents(detail),
  }
}

/**
 * Just the payments that carry a proof, for the ledger's preview dialog.
 *
 * The list signs a proof only when the desk asks to see one — signing the whole
 * window's proofs on every page load is a storage call per row for images most
 * of them will never open — so this is called from the dialog's own action with
 * the URLs signed for that one booking. Rows are shaped by the same function
 * the detail page uses, so a payment reads the same in both places.
 */
export function toPaymentProofs(
  payments: readonly Payment[],
  club: Club,
  proofs: ProofLookup,
): readonly PaymentLine[] {
  return payments
    .filter((payment) => Boolean(payment.proofUrl))
    .map((payment) => toPaymentLine(payment, club, proofs))
}
