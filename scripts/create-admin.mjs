#!/usr/bin/env node
/**
 * Creates — or repairs — the account the admin console signs in with.
 *
 * The migration that seeds it has to write auth.users, which only a superuser
 * may do; running that snippet from a client fails with "permission denied for
 * table users" because the session is `authenticated`. The Admin API does the
 * same work over HTTP with the service role key, so this needs nothing but
 * .env.local — and it is the only route that also works from a machine with no
 * direct Postgres connection.
 *
 * Usage: pnpm admin:create [email] [password]
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLUB_ID = '00000000-0000-4000-8000-000000000001'
const DEFAULT_EMAIL = 'admin@hassy.com'
const DEFAULT_PASSWORD = 'admin1234'

function fail(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

function loadEnv() {
  const file = join(dirname(fileURLToPath(import.meta.url)), '..', '.env.local')
  let text

  try {
    text = readFileSync(file, 'utf8')
  } catch {
    fail('.env.local not found. Copy .env.example and fill it in.')
  }

  const env = {}

  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())

    if (match) {
      env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
    }
  }

  return env
}

const env = loadEnv()
const url = env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
const email = process.argv[2] ?? DEFAULT_EMAIL
const password = process.argv[3] ?? DEFAULT_PASSWORD

if (!url) {
  fail('NEXT_PUBLIC_SUPABASE_URL is not set in .env.local')
}

if (!serviceKey) {
  fail(
    'SUPABASE_SERVICE_ROLE_KEY is empty in .env.local.\n' +
      '       Dashboard -> Project Settings -> API keys -> the "service_role" secret.\n' +
      '       Server-only: never prefix it with NEXT_PUBLIC_.',
  )
}

/** One call against the project, authenticated as the service role. */
async function call(path, init = {}) {
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  const body = response.status === 204 ? null : await response.json().catch(() => null)

  if (!response.ok) {
    fail(`${init.method ?? 'GET'} ${path} => ${response.status} ${JSON.stringify(body)}`)
  }

  return body
}

async function findUser(address) {
  // The Admin API pages through users; the account is one of a handful here.
  for (let page = 1; page <= 20; page += 1) {
    const body = await call(`/auth/v1/admin/users?page=${page}&per_page=200`)
    const users = body?.users ?? []
    const found = users.find((user) => user.email?.toLowerCase() === address.toLowerCase())

    if (found) {
      return found
    }

    if (users.length < 200) {
      return null
    }
  }

  return null
}

const existing = await findUser(email)
const user = existing
  ? // `email_confirm` also stamps an address that was created without one, which
    // is the state that makes sign-in answer "not confirmed".
    await call(`/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ password, email_confirm: true }),
    })
  : await call('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true }),
    })

// The account can sign in on its own, but the /admin layout needs this row and
// RLS keys off the club, so the two have to be written together.
await call('/rest/v1/staff?on_conflict=user_id', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify([
    { user_id: user.id, club_id: CLUB_ID, role: 'admin', full_name: 'Admin' },
  ]),
})

console.log(`${existing ? 'updated' : 'created'} ${email} (${user.id}), confirmed, staff role = admin`)
console.log(`sign in at /staff/sign-in with that address and the password you passed`)
