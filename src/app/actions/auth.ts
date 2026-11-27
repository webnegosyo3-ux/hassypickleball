'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { err, ok, type Err, type Result } from '@/lib/api/result'

const credentialsSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

const UNCONFIRMED =
  'This address has not been confirmed yet. An administrator has to confirm it before you can sign in.'
const UNREACHABLE = 'The sign-in service could not be reached. Check the connection and try again.'

/**
 * Staff sign-in with an email address and password.
 *
 * A wrong password and an address that does not exist return the same message,
 * so this cannot be used to work out which addresses belong to staff. The one
 * exception is an unconfirmed address: Supabase only reports that once the
 * password has matched, so repeating it gives nothing away — and it is the
 * difference between "type it again" and "confirm the account".
 *
 * Authorisation is decided later by getCurrentStaff() and by RLS, not here — a
 * signed-in user with no staff row is sent straight back by the /admin layout.
 *
 * Returns only on failure: success redirects, and redirect() throws.
 */
export async function signInWithEmailAndPassword(input: unknown): Promise<Err> {
  const parsed = credentialsSchema.safeParse(input)

  if (!parsed.success) {
    return err(parsed.error.issues[0].message, 'INVALID')
  }

  const client = await createSupabaseServerClient()

  let failure: { code?: string; message?: string } | null = null

  try {
    const { error } = await client.auth.signInWithPassword(parsed.data)
    failure = error
  } catch (cause) {
    // A throw here is transport, not credentials — never blame the password.
    console.error('signInWithPassword did not reach Supabase', cause)
    return err(UNREACHABLE, 'AUTH_ERROR')
  }

  if (failure?.code === 'email_not_confirmed') {
    console.error('signInWithPassword refused an unconfirmed address', {
      email: parsed.data.email,
    })
    return err(UNCONFIRMED, 'AUTH_ERROR')
  }

  if (failure) {
    // The code is the only part worth having in the log; the address is not.
    console.error('signInWithPassword rejected the credentials', { code: failure.code })
    return err('Email or password is incorrect', 'AUTH_ERROR')
  }

  redirect('/admin')
}

export async function signOut(): Promise<Result<{ signedOut: true }>> {
  const client = await createSupabaseServerClient()
  const { error } = await client.auth.signOut()

  if (error) {
    return err('Could not sign out', 'AUTH_ERROR')
  }

  return ok({ signedOut: true })
}
