import { redirect } from 'next/navigation'
import { signInWithEmailAndPassword } from '@/app/actions/auth'
import { AuthShell } from '@/features/admin/ui/auth-shell'
import { StaffSignInForm } from '@/features/admin/ui/staff-sign-in-form'
import { getCurrentStaff } from '@/lib/auth/staff'

/**
 * Where the admin layout sends anyone without a staff session.
 *
 * Someone who is already staff is bounced straight to the console rather than
 * being asked to sign in again.
 */
export default async function StaffSignInPage() {
  if (await getCurrentStaff()) {
    redirect('/admin')
  }

  return (
    <AuthShell>
      <h1 className="mb-1.5 mt-0 font-[family-name:var(--font-display)] text-[26px] font-bold tracking-[-0.03em]">
        Staff sign-in
      </h1>
      <p className="mt-0 mb-6 text-[14px] text-muted">
        Sign in with your work email to reach the admin console.
      </p>

      <StaffSignInForm onSubmit={signInWithEmailAndPassword} />
    </AuthShell>
  )
}
