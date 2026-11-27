import { describe, expect, it } from 'vitest'
import { sessionExpiresAt } from './session-cookie'

/** The cookie is base64url with the padding stripped, so mirror that here. */
function encodeJson(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function chunk(value: string, size: number): readonly string[] {
  return value.match(new RegExp(`.{1,${size}}`, 'g')) ?? []
}

const EXPIRES_AT = 1_800_000_000

describe('sessionExpiresAt', () => {
  it('reads expires_at out of a base64 cookie', () => {
    const value = `base64-${encodeJson({ access_token: 'token', expires_at: EXPIRES_AT })}`

    expect(sessionExpiresAt([{ name: 'sb-app-auth-token', value }])).toBe(EXPIRES_AT)
  })

  it('reads a legacy cookie that stores the session as plain JSON', () => {
    const value = JSON.stringify({ access_token: 'token', expires_at: EXPIRES_AT })

    expect(sessionExpiresAt([{ name: 'sb-app-auth-token', value }])).toBe(EXPIRES_AT)
  })

  it('reassembles a session split across chunk cookies', () => {
    const value = `base64-${encodeJson({ access_token: 'token', expires_at: EXPIRES_AT })}`
    const parts = chunk(value, 20)

    const cookies = parts
      .map((part, index) => ({ name: `sb-app-auth-token.${index}`, value: part }))
      // Browser order is not guaranteed; the chunk index is what orders them.
      .reverse()

    expect(sessionExpiresAt(cookies)).toBe(EXPIRES_AT)
  })

  it('falls back to the access token exp claim when the session has no expires_at', () => {
    const claims = encodeJson({ exp: EXPIRES_AT, sub: 'user-1' })
    const value = `base64-${encodeJson({ access_token: `header.${claims}.signature` })}`

    expect(sessionExpiresAt([{ name: 'sb-app-auth-token', value }])).toBe(EXPIRES_AT)
  })

  it('reports unknown for a request with no auth cookie', () => {
    expect(sessionExpiresAt([{ name: 'theme', value: 'dark' }])).toBeNull()
  })

  it('reports unknown for a value it cannot decode, so the caller asks the server', () => {
    expect(sessionExpiresAt([{ name: 'sb-app-auth-token', value: 'base64-not-json' }])).toBeNull()
  })
})
