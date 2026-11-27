import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInWithPassword = vi.fn()
const signOut = vi.fn()
const createSupabaseServerClient = vi.fn()
const redirect = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient }))
vi.mock('next/navigation', () => ({ redirect }))

const { signInWithEmailAndPassword } = await import('./auth')

const CREDENTIALS = { email: 'admin@pickleball.com', password: 'PickelBall@Admin!2026' }

beforeEach(() => {
  vi.clearAllMocks()
  createSupabaseServerClient.mockResolvedValue({ auth: { signInWithPassword, signOut } })
})

describe('signInWithEmailAndPassword', () => {
  it('rejects a malformed email without calling Supabase', async () => {
    // Act
    const result = await signInWithEmailAndPassword({ email: 'not-an-email', password: 'whatever' })

    // Assert
    expect(result).toEqual({
      success: false,
      error: 'Enter a valid email address',
      code: 'INVALID',
    })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('rejects an empty password without calling Supabase', async () => {
    // Act
    const result = await signInWithEmailAndPassword({ email: CREDENTIALS.email, password: '' })

    // Assert
    expect(result).toEqual({ success: false, error: 'Enter your password', code: 'INVALID' })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('signs the staff member in with the credentials they typed', async () => {
    // Arrange
    signInWithPassword.mockResolvedValue({ error: null })

    // Act
    await signInWithEmailAndPassword(CREDENTIALS)

    // Assert
    expect(signInWithPassword).toHaveBeenCalledWith(CREDENTIALS)
  })

  it('sends a signed-in staff member to the admin console', async () => {
    // Arrange
    signInWithPassword.mockResolvedValue({ error: null })

    // Act
    await signInWithEmailAndPassword(CREDENTIALS)

    // Assert
    expect(redirect).toHaveBeenCalledWith('/admin')
  })

  it('gives one generic message for bad credentials so emails cannot be enumerated', async () => {
    // Arrange — a distinct "no such user" message would turn this into a staff directory.
    signInWithPassword.mockResolvedValue({
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    })

    // Act
    const result = await signInWithEmailAndPassword(CREDENTIALS)

    // Assert
    expect(result).toEqual({
      success: false,
      error: 'Email or password is incorrect',
      code: 'AUTH_ERROR',
    })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('names an unconfirmed address instead of blaming the password', async () => {
    // Arrange — Supabase only answers this once the password matched.
    signInWithPassword.mockResolvedValue({
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    })

    // Act
    const result = await signInWithEmailAndPassword(CREDENTIALS)

    // Assert
    expect(result).toMatchObject({ success: false, code: 'AUTH_ERROR' })
    expect(result.success === false && result.error).toContain('has not been confirmed')
    expect(redirect).not.toHaveBeenCalled()
  })

  it('does not blame the password when the request never reached Supabase', async () => {
    // Arrange
    signInWithPassword.mockRejectedValue(new Error('fetch failed'))

    // Act
    const result = await signInWithEmailAndPassword(CREDENTIALS)

    // Assert
    expect(result).toMatchObject({ success: false, code: 'AUTH_ERROR' })
    expect(result.success === false && result.error).toContain('could not be reached')
  })
})
