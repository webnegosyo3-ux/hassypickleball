import { z } from 'zod'

/**
 * Environment contract. Parsed at module load so a misconfigured deployment
 * fails at startup rather than at the first request that needs a key.
 */
/**
 * `new URL('localhost:54321')` succeeds with protocol "localhost:", so a bare
 * URL check would wave through a host that no HTTP client can reach. Require
 * an explicit http/https scheme.
 */
const httpUrl = z.string().refine(
  (value) => {
    try {
      return ['http:', 'https:'].includes(new URL(value).protocol)
    } catch {
      return false
    }
  },
  { message: 'Must be an http(s) URL' },
)

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: httpUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
})

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

export type PublicEnv = z.infer<typeof publicEnvSchema>
export type ServerEnv = z.infer<typeof serverEnvSchema>

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
}

/**
 * Supabase renamed its API keys: projects created today issue
 * `sb_publishable_…` and `sb_secret_…` under PUBLISHABLE/SECRET names, while
 * older projects issue JWT anon/service-role keys. Both namings are accepted so
 * the app starts against either, with the legacy name winning if both are set.
 */
const publishableKey = (): string | undefined =>
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const secretKey = (): string | undefined =>
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY

/**
 * Values inlined into the client bundle. Referenced via literal
 * `process.env.X` so the Next.js compiler can statically replace them.
 */
export function readPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publishableKey(),
  })

  if (!parsed.success) {
    throw new Error(`Invalid public environment: ${formatIssues(parsed.error)}`)
  }

  return parsed.data
}

/** Includes the service-role key. Never call this from a client component. */
export function readServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publishableKey(),
    SUPABASE_SERVICE_ROLE_KEY: secretKey(),
  })

  if (!parsed.success) {
    throw new Error(`Invalid server environment: ${formatIssues(parsed.error)}`)
  }

  return parsed.data
}
