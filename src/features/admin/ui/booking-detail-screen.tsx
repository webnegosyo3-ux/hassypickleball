'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AdminScreen, CARD } from './primitives'
import { BookingDetailPanel } from './booking-detail-panel'
import { DeleteBookingButton } from './delete-booking'
import type { BookingDetailView } from '../view/bookings'
import type { Result } from '@/lib/api/result'

/**
 * One booking on a page of its own.
 *
 * Managing used to open beside the ledger in a side panel, which left the list
 * 1100px wide inside a column 686px wide and pushed the ten-column table into a
 * sideways scroll. The record now has the full width, the ledger has the full
 * width, and a booking's URL can be sent to a colleague on its own — which is
 * what the `?booking=` query parameter was approximating.
 *
 * The card is capped at 720px because a breakdown of label/value rows stretched
 * across a 1440px screen reads as two unrelated columns, and the space beside it
 * is where the one destructive action lives, away from the buttons used daily.
 */

export interface BookingDetailScreenProps {
  readonly detail: BookingDetailView
  readonly currency: string
  readonly onSetStatus: (payload: unknown) => Promise<Result<unknown>>
  readonly onMarkPaid: (payload: unknown) => Promise<Result<unknown>>
  readonly onRefund: (payload: unknown) => Promise<Result<unknown>>
  readonly onDelete: (payload: unknown) => Promise<Result<unknown>>
}

export function BookingDetailScreen({
  detail,
  currency,
  onSetStatus,
  onMarkPaid,
  onRefund,
  onDelete,
}: BookingDetailScreenProps) {
  const router = useRouter()

  return (
    <AdminScreen>
      <Link
        href="/admin/bookings"
        className="mb-3 inline-flex h-11 items-center gap-1.5 text-[14px] font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy-mid sm:h-9"
      >
        <span aria-hidden>‹</span> All bookings
      </Link>

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)]">
        <BookingDetailPanel
          detail={detail}
          currency={currency}
          headingLevel="h1"
          onSetStatus={onSetStatus}
          onMarkPaid={onMarkPaid}
          onRefund={onRefund}
          onDone={() => router.refresh()}
        />

        <section aria-label="Delete booking" className={`${CARD} px-4 py-4 sm:px-5`}>
          <h2 className="m-0 mb-1.5 font-[family-name:var(--font-display)] text-[16px] font-bold">
            Delete this booking
          </h2>
          <p className="mt-0 mb-3 text-[13px] leading-relaxed text-slate">
            Cancelling keeps {detail.reference} on record for reconciliation. Deleting erases it
            along with its payments, players, and court holds, and cannot be undone.
          </p>

          <DeleteBookingButton
            bookingId={detail.id}
            reference={detail.reference}
            onDelete={onDelete}
            /* `replace`: the page being left no longer exists, so the back
               button must not lead to it. */
            onDeleted={() => router.replace('/admin/bookings')}
          />
        </section>
      </div>
    </AdminScreen>
  )
}
