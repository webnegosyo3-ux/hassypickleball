import 'server-only'

import { cache } from 'react'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Enums } from '@/lib/repositories/rows'

export type StaffMember = {
  readonly id: string
  readonly userId: string
  readonly clubId: string
  readonly role: Enums['staff_role']
  readonly fullName: string
}

/**
 * Why the caller does or does not have the console.
 *
 * `anonymous` and `not-staff` are both "no access", but they are not the same
 * problem and must not get the same answer: sending a signed-in non-staff user
 * to the sign-in page loops them through a form they have already completed.
 */
export type StaffAccess =
  | { readonly status: 'anonymous' }
  | { readonly status: 'not-staff' }
  | { readonly status: 'staff'; readonly staff: StaffMember }

const ANONYMOUS: StaffAccess = { status: 'anonymous' }
const NOT_STAFF: StaffAccess = { status: 'not-staff' }

/**
 * Uses the anon-key server client so RLS applies: the `staff_self_read` policy
 * is what actually decides whether this row is visible.
 *
 * Always reads the user via getUser(), never getSession() — getSession() trusts
 * the cookie without revalidating it against the auth server.
 *
 * A failed lookup is reported as not-staff rather than thrown: RLS is the real
 * boundary, so the safe reading of "we could not confirm this" is no access.
 *
 * Cached per request: the console layout asks for access to decide whether to
 * render, and every page under it asks again for the staff record. Without the
 * cache that is a second getUser() round trip to the auth server plus a second
 * staff query on every navigation — paid before any page data is even read.
 */
export const getStaffAccess = cache(async (): Promise<StaffAccess> => {
  const client = await createSupabaseServerClient()

  const {
    data: { user },
  } = await client.auth.getUser()

  if (!user) {
    return ANONYMOUS
  }

  const { data, error } = await client
    .from('staff')
    .select('id, user_id, club_id, role, full_name')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (error || !data) {
    return NOT_STAFF
  }

  return {
    status: 'staff',
    staff: {
      id: data.id,
      userId: data.user_id,
      clubId: data.club_id,
      role: data.role,
      fullName: data.full_name,
    },
  }
})

/**
 * The signed-in user's staff record, or null, for callers that only need to
 * know whether to act — every mutation gate, which fails the same way either
 * way. Anything that renders for the caller wants getStaffAccess() instead.
 */
export async function getCurrentStaff(): Promise<StaffMember | null> {
  const access = await getStaffAccess()

  return access.status === 'staff' ? access.staff : null
}
