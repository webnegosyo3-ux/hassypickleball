import { loadConsole, trailingWindow } from '../console-data'
import { BookingsScreen } from '@/features/admin/ui/bookings-screen'
import { toBookingRows } from '@/features/admin/view/bookings'
import { deleteBookingAction, loadBookingProofsAction } from '@/features/admin/actions'
import { listBookingsInWindow } from '@/lib/repositories/bookings'

/**
 * The console's one ledger. Thirty days back covers reconciling a transfer
 * that landed late; a week forward is what the desk is preparing for. The
 * Orders screen used to own the first half of that range on its own.
 *
 * Reading is all this page does now: a booking is opened, managed, and deleted
 * on its own page. Proofs are signed there, for one booking, rather than for
 * every row in the window — and the ledger's proof dialog signs its own on
 * demand through the same first step, so this page still signs nothing.
 */
const DAYS_BACK = 30
const DAYS_FORWARD = 7
const MS_PER_DAY = 86_400_000

export default async function AdminBookingsPage() {
  const { client, club } = await loadConsole()
  const past = trailingWindow(club, DAYS_BACK)

  const bookings = await listBookingsInWindow(client, {
    clubId: club.id,
    from: past.from,
    to: new Date(past.to.getTime() + DAYS_FORWARD * MS_PER_DAY),
  })

  return (
    <BookingsScreen
      rows={toBookingRows(bookings, club)}
      onDelete={deleteBookingAction}
      onLoadProof={loadBookingProofsAction}
    />
  )
}
