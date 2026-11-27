/**
 * Reading the session's expiry straight out of the Supabase cookie.
 *
 * The proxy refreshes the session on every request by calling getUser(), which
 * is a network round trip to the auth server — around 150 ms, paid before any
 * page data is read. When the access token is still comfortably in the future
 * there is nothing to refresh, and that round trip is pure latency.
 *
 * Nothing here is trusted for authorization. It only answers "is a refresh
 * needed yet?"; the console still revalidates the user server-side through
 * getUser(), which is where the decision actually lives.
 */

/**
 * `sb-<ref>-auth-token`, plus the `.0`, `.1` chunks @supabase/ssr splits large
 * sessions into when the browser refuses a cookie that size.
 */
const AUTH_COOKIE = /^sb-.+-auth-token(?:\.(\d+))?$/

type Cookie = { readonly name: string; readonly value: string }

/** The reassembled cookie value, or null when no auth cookie is present. */
function authCookieValue(cookies: readonly Cookie[]): string | null {
  const parts = cookies
    .flatMap((cookie) => {
      const match = AUTH_COOKIE.exec(cookie.name)

      return match ? [{ index: Number(match[1] ?? 0), value: cookie.value }] : []
    })
    .sort((left, right) => left.index - right.index)

  if (parts.length === 0) {
    return null
  }

  return parts.map((part) => part.value).join('')
}

/** `base64-<base64url JSON>` in current @supabase/ssr, raw JSON in older ones. */
function decodeCookie(value: string): unknown {
  const encoded = value.startsWith('base64-') ? value.slice('base64-'.length) : value
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')

  try {
    const json = value.startsWith('base64-')
      ? atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
      : encoded

    return JSON.parse(json)
  } catch {
    return null
  }
}

function accessTokenExpiry(session: unknown): number | null {
  if (typeof session !== 'object' || session === null) {
    return null
  }

  const { access_token: accessToken, expires_at: expiresAt } = session as Record<string, unknown>

  if (typeof expiresAt === 'number') {
    return expiresAt
  }

  if (typeof accessToken !== 'string') {
    return null
  }

  const payload = accessToken.split('.')[1]

  if (payload === undefined) {
    return null
  }

  const claims = decodeCookie(`base64-${payload}`) as { exp?: unknown } | null

  return claims !== null && typeof claims.exp === 'number' ? claims.exp : null
}

/**
 * Seconds since the epoch at which the session's access token expires, or null
 * when the cookie is absent or not readable — the caller should treat null as
 * "unknown, go and ask the auth server".
 */
export function sessionExpiresAt(cookies: readonly Cookie[]): number | null {
  const value = authCookieValue(cookies)

  return value === null ? null : accessTokenExpiry(decodeCookie(value))
}
