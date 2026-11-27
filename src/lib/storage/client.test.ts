import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Result } from '@/lib/api/result'

const hasServerSecret = vi.fn()
const createSupabaseAdminClient = vi.fn()
const createSignedUrl = vi.fn()

vi.mock('@/lib/env', () => ({ hasServerSecret }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient }))

const { signStoredImageUrl, uploadImage } = await import('./client')

/**
 * A proof of payment lives in a private bucket, so the console can only show it
 * through a link signed for a few minutes. What this module does when it cannot
 * sign one is the difference between a staff member who knows what to fix and a
 * staff member told to "check the storage key" for three unrelated problems.
 */

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})

  hasServerSecret.mockReturnValue(true)
  createSupabaseAdminClient.mockReturnValue({
    storage: { from: () => ({ createSignedUrl }) },
  })
  createSignedUrl.mockResolvedValue({
    data: { signedUrl: 'https://signed.example/abc' },
    error: null,
  })
})

describe('signStoredImageUrl', () => {
  it('signs the stored path for five minutes and returns the link', async () => {
    const result = await signStoredImageUrl('payment-proofs/PB-4821/proof.png')

    expect(createSignedUrl).toHaveBeenCalledWith(
      'payment-proofs/PB-4821/proof.png',
      expect.any(Number),
    )
    expect(result).toEqual({ success: true, data: 'https://signed.example/abc' })
  })

  it('names the missing secret instead of blaming the proof', async () => {
    // Arrange — the deployment has no service-role key, so no bucket can be read.
    hasServerSecret.mockReturnValue(false)

    // Act
    const result = await signStoredImageUrl('PB-4821/proof.png')

    // Assert
    expect(result).toMatchObject({ success: false, code: 'STORAGE_NOT_CONFIGURED' })
    expect(messageOf(result)).toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it('says the file is gone when the object is not in the bucket', async () => {
    createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'Object not found', statusCode: '404' },
    })

    const result = await signStoredImageUrl('PB-4821/proof.png')

    expect(result).toMatchObject({ success: false, code: 'STORAGE_ERROR' })
    expect(messageOf(result)).toContain('no longer in storage')
  })

  it('names the bucket when the migration was never applied', async () => {
    createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found', statusCode: '404' },
    })

    const result = await signStoredImageUrl('PB-4821/proof.png')

    expect(messageOf(result)).toContain('payment-proofs')
    expect(messageOf(result)).toContain('migration')
  })

  it('refuses a path that could climb out of the bucket', async () => {
    const result = await signStoredImageUrl('../../etc/passwd')

    expect(result).toMatchObject({ success: false, code: 'STORAGE_ERROR' })
    expect(createSignedUrl).not.toHaveBeenCalled()
  })
})

describe('uploadImage', () => {
  it('says the store is not configured when the secret is missing, rather than blaming the network', async () => {
    // Arrange
    hasServerSecret.mockReturnValue(false)

    // Act
    const result = await uploadImage({
      folder: '/payment-proofs/PB-4821',
      fileName: 'proof.png',
      contentType: 'image/png',
      body: new ArrayBuffer(8),
      isPrivate: true,
    })

    // Assert
    expect(result).toMatchObject({ success: false, code: 'STORAGE_NOT_CONFIGURED' })
    expect(createSupabaseAdminClient).not.toHaveBeenCalled()
  })
})

/** The sentence the console will put in front of a staff member. */
function messageOf(result: Result<string>): string {
  return result.success ? '' : result.error
}
