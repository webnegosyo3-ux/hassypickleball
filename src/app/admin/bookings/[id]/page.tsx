import { notFound } from 'next/navigation'
import { loadConsole } from '../../console-data'
import { BookingDetailScreen } from '@/features/admin/ui/booking-detail-screen'
import { toBookingDetailView } from '@/features/admin/view/bookings'
import { signPaymentProofs } from '@/features/admin/server/proofs'
import { loadBookingDetail } from '@/lib/repositories/bookings'
import {
  deleteBookingAction,
  markBookingPaidAction,
  refundPaymentAction,
  setBookingStatusAction,
} from '@/features/admin/actions'

/**
 * One booking, at its own address.
 *
 * The console used to open this beside the ledger in a side panel, which spent
 * two thirds of the page on a table that then had to scroll sideways. A real
 * route means the record gets the width, the URL can be shared, and a refresh
 * keeps the desk on the booking it was reading.
 */
type AdminBookingPageProps = {
  params: Promise<{ id: string }>
}

export default async function AdminBookingPage({ params }: AdminBookingPageProps) {
  const [{ client, club }, { id }] = await Promise.all([loadConsole(), params])

  // RLS decides which bookings exist for this staff member, so another club's
  // id, a deleted booking, and a malformed one all arrive here as nothing.
  const detail = await loadBookingDetail(client, id)

  if (!detail) {
    notFound()
  }

  // Proofs sit in a private bucket: they are signed per request, and one that
  // fails to sign is rendered as unreadable — with the reason — rather than as
  // a link that 403s.
  const proofs = await signPaymentProofs(detail.payments)

  return (
    <BookingDetailScreen
      detail={toBookingDetailView(detail, club, proofs)}
      currency={club.currency}
      onSetStatus={setBookingStatusAction}
      onMarkPaid={markBookingPaidAction}
      onRefund={refundPaymentAction}
      onDelete={deleteBookingAction}
    />
  )
}
