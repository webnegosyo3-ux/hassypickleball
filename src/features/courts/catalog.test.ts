import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The catalog read runs inside an unstable_cache scope, where Next.js forbids
 * touching per-request state. These tests stand in for that scope: the
 * cookie-bound client throws exactly as `cookies()` does when called from
 * inside a cached function, so any read that reaches for request state fails
 * here the same way it fails in the browser.
 */

let isInsideCacheScope = false

const findClubBySlug = vi.fn()
const listActiveCourts = vi.fn()

vi.mock('next/cache', () => ({
  unstable_cache:
    (fn: (...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      isInsideCacheScope = true

      try {
        return await fn(...args)
      } finally {
        isInsideCacheScope = false
      }
    },
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => {
    if (isInsideCacheScope) {
      throw new Error('Route / used `cookies()` inside a function cached with `unstable_cache()`.')
    }

    return { kind: 'cookie-bound' }
  },
}))

vi.mock('@/lib/repositories/clubs', () => ({ findClubBySlug }))
vi.mock('@/lib/repositories/courts', () => ({ listActiveCourts }))

const { loadCatalog } = await import('./catalog')

const CLUB = { id: 'club-1', slug: 'baseline', name: 'Baseline Club' }
const COURTS = [{ id: 'court-1', clubId: 'club-1', slug: 'court-a' }]

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
  findClubBySlug.mockResolvedValue(CLUB)
  listActiveCourts.mockResolvedValue(COURTS)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('loadCatalog', () => {
  it('reads the club and its courts without touching request state', async () => {
    const catalog = await loadCatalog('baseline')

    expect(catalog).toEqual({ club: CLUB, courts: COURTS })
  })

  it('returns null when the club slug does not exist', async () => {
    findClubBySlug.mockResolvedValue(null)

    const catalog = await loadCatalog('missing')

    expect(catalog).toBeNull()
    expect(listActiveCourts).not.toHaveBeenCalled()
  })

  it('reads courts with the same client used for the club', async () => {
    await loadCatalog('baseline')

    expect(listActiveCourts.mock.calls[0][0]).toBe(findClubBySlug.mock.calls[0][0])
  })
})
