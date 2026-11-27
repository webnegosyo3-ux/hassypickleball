import 'server-only'

import { hasServerSecret } from '@/lib/env'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Client } from '@/lib/repositories/support'

/**
 * The client availability is read with, and whether it can see past RLS.
 *
 * With a service-role secret the reads go at the tables directly, which also
 * buys tier pricing for a known customer. Without one the club still needs a
 * working calendar, so the reads go through `court_day_busy` — taken intervals
 * and nothing else. That path is unprivileged, so anything needing more (the
 * customer lookup, other people's booking rows) is skipped rather than guessed.
 *
 * Every availability read goes through here rather than deciding for itself:
 * a path that always asks for the service-role client is a path that stops
 * working the day the key is absent, and does it silently.
 */
export type AvailabilityAccess = {
  readonly client: Client
  readonly privileged: boolean
}

export async function availabilityAccess(): Promise<AvailabilityAccess> {
  if (hasServerSecret()) {
    return { client: createSupabaseAdminClient(), privileged: true }
  }

  return { client: await createSupabaseServerClient(), privileged: false }
}
