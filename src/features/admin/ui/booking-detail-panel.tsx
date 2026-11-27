'use client'

import { useState, useTransition } from 'react'
import Image from 'next/image'
import { CARD } from './primitives'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { PaymentBadge } from './payment-badge'
import { toCents, toMajorUnits } from '../view/money-fields'
import type { BookingDetailView, PaymentLine } from '../view/bookings'
import type { BookingStatus } from '@/lib/domain/types'
import type { Result } from '@/lib/api/result'

/**
 * Managing one booking: the breakdown, the money against it, and the moves the
 * desk can make.
 *
 * Only the transitions the server would accept are rendered, because the view
 * layer derives them from the same table the server checks. A booking whose
 * life has ended offers nothing rather than buttons that come back refused.
 */

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'gcash', label: 'GCash' },
  { value: 'online', label: 'Online' },
] as const

const STATUS_ACTIONS: Record<
  BookingStatus,
  { label: string; variant: 'primary' | 'secondary' | 'danger' }
> = {
  pending: { label: 'Move to awaiting payment', variant: 'secondary' },
  awaiting_payment: { label: 'Move to awaiting payment', variant: 'secondary' },
  confirmed: { label: 'Confirm booking', variant: 'primary' },
  completed: { label: 'Mark completed', variant: 'secondary' },
  cancelled: { label: 'Cancel booking', variant: 'danger' },
}

const CLOSED_MESSAGE = 'This booking is closed. Rebook to put the customer back on a court.'
const NOTHING_OWED = 'A payment must be for more than nothing'

const FIELD =
  'h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] sm:h-10 sm:text-sm ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-mid'
const LABEL = 'text-[12px] font-bold tracking-[0.06em] text-subtle uppercase'
const ROW = 'flex justify-between gap-4 text-[14px]'

export interface BookingDetailPanelProps {
  readonly detail: BookingDetailView
  readonly currency: string
  /**
   * The panel is the whole page on /admin/bookings/[id], so its reference is
   * that page's `h1`; inside a card it is an `h2`.
   */
  readonly headingLevel?: 'h1' | 'h2'
  readonly onSetStatus: (payload: unknown) => Promise<Result<unknown>>
  readonly onMarkPaid: (payload: unknown) => Promise<Result<unknown>>
  readonly onRefund: (payload: unknown) => Promise<Result<unknown>>
  /** Fired after any write lands, so the screen can pull fresh server data. */
  readonly onDone: () => void
}

export function BookingDetailPanel({
  detail,
  currency,
  headingLevel = 'h2',
  onSetStatus,
  onMarkPaid,
  onRefund,
  onDone,
}: BookingDetailPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0].value)
  const [amount, setAmount] = useState(() => toMajorUnits(detail.outstandingCents))
  const [reference, setReference] = useState('')
  const [isPending, startTransition] = useTransition()
  const Heading = headingLevel

  /** Every write reports the same way: an error stays put, a success refreshes. */
  function run(write: () => Promise<Result<unknown>>): void {
    setError(null)

    startTransition(async () => {
      const result = await write()

      if (!result.success) {
        setError(result.error)
        return
      }

      onDone()
    })
  }

  function recordPayment(): void {
    const amountCents = toCents(amount)

    // Checked here as well as in the schema so the desk gets the reason
    // immediately rather than after a round trip.
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError(NOTHING_OWED)
      return
    }

    run(() =>
      onMarkPaid({
        bookingId: detail.id,
        method,
        amountCents,
        externalReference: reference.trim() === '' ? null : reference.trim(),
      }),
    )
  }

  return (
    <section
      aria-label={`Booking ${detail.reference}`}
      className={`${CARD} px-4 py-4 sm:px-6 sm:py-5`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Heading
          className={`m-0 font-[family-name:var(--font-display)] font-bold ${
            headingLevel === 'h1' ? 'text-[24px] sm:text-[27px]' : 'text-[19px]'
          }`}
        >
          {detail.reference}
        </Heading>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={detail.status} />
          <PaymentBadge status={detail.paymentStatus} />
        </div>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-xl bg-danger-bg px-4 py-3 text-[13px] text-danger">
          {error}
        </p>
      ) : null}

      <dl className="m-0 flex flex-col gap-2.5 border-b border-surface-sunken pb-4">
        {detail.meta.map((line) => (
          <div key={line.label} className={ROW}>
            <dt className="text-muted">{line.label}</dt>
            <dd className="m-0 text-right font-semibold">{line.value}</dd>
          </div>
        ))}
      </dl>

      {detail.players.length > 0 ? (
        <div className="border-b border-surface-sunken py-4">
          <h3 className={`${LABEL} m-0 mb-2.5`}>Players</h3>
          <ul aria-label="Players" className="m-0 flex list-none flex-wrap gap-2 p-0 text-[13.5px]">
            {detail.players.map((player, index) => (
              <li
                key={`${index}-${player}`}
                className="rounded-lg bg-surface-alt px-3 py-2 font-semibold"
              >
                {player}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <dl className="m-0 flex flex-col gap-2.5 border-b border-surface-sunken py-4">
        {detail.lines.map((line) => (
          <div key={line.label} className={ROW}>
            <dt className="text-slate">{line.label}</dt>
            <dd className="m-0 tabular-nums">{line.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3.5 mb-0 flex items-baseline justify-between">
        <span className="font-bold">Total</span>
        <span className="font-[family-name:var(--font-display)] text-[24px] font-bold">
          {detail.total}
        </span>
      </p>

      <Payments
        payments={detail.payments}
        isPending={isPending}
        onRefund={(paymentId) => run(() => onRefund({ paymentId }))}
      />

      <div className="mt-5 border-t border-surface-sunken pt-4">
        <h3 className={`${LABEL} m-0 mb-3`}>Record a payment</h3>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Method</span>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              className={FIELD}
            >
              {PAYMENT_METHODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>{`Amount (${currency})`}</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={FIELD}
            />
          </label>

          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className={LABEL}>Reference (optional)</span>
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Deposit slip or gateway id"
              className={FIELD}
            />
          </label>
        </div>

        <Button onClick={recordPayment} isPending={isPending} className="mt-3 max-sm:w-full">
          Record payment
        </Button>
      </div>

      <div className="mt-5 border-t border-surface-sunken pt-4">
        {detail.nextStatuses.length === 0 ? (
          <p className="m-0 text-[13px] text-muted">{CLOSED_MESSAGE}</p>
        ) : (
          /* Stacked and full width on a phone: these are the moves the
             desk makes one-handed at the counter. */
          <div className="flex flex-wrap gap-2.5 max-sm:flex-col">
            {detail.nextStatuses.map((status) => (
              <Button
                key={status}
                variant={STATUS_ACTIONS[status].variant}
                isPending={isPending}
                onClick={() => run(() => onSetStatus({ bookingId: detail.id, status }))}
              >
                {STATUS_ACTIONS[status].label}
              </Button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-4 mb-0 rounded-[11px] border border-surface-sunken bg-surface-alt px-4 py-3.5 text-[13.5px] leading-relaxed text-slate">
        {detail.note}
      </p>
    </section>
  )
}

interface PaymentsProps {
  readonly payments: readonly PaymentLine[]
  readonly isPending: boolean
  readonly onRefund: (paymentId: string) => void
}

function Payments({ payments, isPending, onRefund }: PaymentsProps) {
  if (payments.length === 0) {
    return <p className="mt-4 mb-0 text-[13px] text-muted">No payment recorded yet.</p>
  }

  return (
    <ul aria-label="Payments" className="mt-4 mb-0 flex list-none flex-col gap-2.5 p-0">
      {payments.map((payment) => (
        <li
          key={payment.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-[11px] bg-surface-alt px-3.5 py-2.5 text-[13.5px]"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{payment.method}</span>
            <PaymentBadge status={payment.status} />
          </span>

          <span className="flex flex-wrap items-center gap-3">
            <span className="tabular-nums">{payment.amount}</span>

            {/* Only settled money can be given back. */}
            {payment.status === 'paid' ? (
              <Button
                variant="ghost"
                size="sm"
                isPending={isPending}
                onClick={() => onRefund(payment.id)}
              >
                Refund
              </Button>
            ) : null}
          </span>

          <Proof payment={payment} />
        </li>
      ))}
    </ul>
  )
}

/**
 * The guest's proof of payment, shown rather than merely linked.
 *
 * The desk is checking a photograph of someone's banking app against the amount
 * on the row; sending them to another tab for every payment meant the check was
 * usually skipped. The thumbnail opens the full-size image for the times the
 * amount is too small to read.
 *
 * Three states, and they are not the same thing: a proof that opens, a proof on
 * file whose signed link could not be produced, and no proof at all — which only
 * matters when the money has not landed. The middle one carries the reason the
 * server gave, because an unset storage secret and a deleted object need
 * different people to fix them.
 */
function Proof({ payment }: { readonly payment: PaymentLine }) {
  if (!payment.hasProof) {
    return payment.status === 'awaiting' ? (
      <span className="basis-full text-[12.5px] text-muted">No proof uploaded yet.</span>
    ) : null
  }

  if (!payment.proofHref) {
    return (
      <p className="m-0 basis-full rounded-lg bg-danger-bg px-3 py-2 text-[12.5px] font-semibold text-danger">
        {payment.proofError ?? 'That proof could not be opened.'}
      </p>
    )
  }

  return (
    <a
      href={payment.proofHref}
      target="_blank"
      rel="noopener noreferrer"
      className="flex basis-full flex-col items-start gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-mid"
    >
      <Image
        src={payment.proofHref}
        alt=""
        width={320}
        height={220}
        /* Signed URLs expire and are private; the optimiser's on-disk cache
           must not keep a copy of someone's banking app. */
        unoptimized
        className="h-auto max-h-44 w-auto max-w-[260px] rounded-lg border border-line bg-white object-contain"
      />
      <span className="font-semibold text-olive underline">View proof</span>
    </a>
  )
}
