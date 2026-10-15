import { redirect } from 'next/navigation'
import { AdminNav } from '@/features/admin/ui/admin-nav'
import { NoStaffNotice } from '@/features/admin/ui/no-staff-notice'
import { getStaffAccess } from '@/lib/auth/staff'

/** Shown at the head of the console. Fixed here rather than read from clubs.name. */
const CLUB_NAME = 'HASSY PICKLEBALL COURT'

/**
 * Server-side gate for the whole admin console. Rendering is blocked here
 * rather than in middleware so the staff role is read with RLS in force.
 * The database policies remain the real boundary — this only decides what UI
 * gets rendered.
 *
 * Three outcomes, not two. Redirecting a signed-in user who simply has no staff
 * row sent them back to a sign-in form they had just completed successfully,
 * which looks like a rejected password and loops. They are told instead.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getStaffAccess()

  if (access.status === 'anonymous') {
    redirect('/staff/sign-in')
  }

  if (access.status === 'not-staff') {
    return <NoStaffNotice />
  }

  return (
    <>
      <AdminNav clubName={CLUB_NAME} staffName={access.staff.fullName} />
      {/* From `lg` the nav is a fixed 15rem sidebar; the pages sit to its right. */}
      <div className="lg:pl-60">{children}</div>
    </>
  )
}
