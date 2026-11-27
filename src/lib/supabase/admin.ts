import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { hasServerSecret, readServerEnv } from '@/lib/env'
import type { Database } from './database.types'

/**
 * Service-role client. BYPASSES RLS.
 *
 * The `server-only` import makes the build fail if a Client Component ever
 * reaches this module. Use it only where a request genuinely must act outside
 * any user's permissions — seeding, webhooks, admin reconciliation jobs.
 * Prefer createSupabaseServerClient() everywhere else.
 */
export function createSupabaseAdminClient() {
  // The schema error readServerEnv raises — "Too small: expected string to have
  // >=1 characters" — describes the rule, not the fix. Leave the actual missing
  // variable and what to paste into it as the thing whoever reads this learns.
  if (!hasServerSecret()) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is empty. Add the service_role key from your Supabase project (Project Settings, API) to .env.local, then restart.',
    )
  }

  const env = readServerEnv()

  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
