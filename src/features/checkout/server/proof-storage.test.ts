import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadPaymentProof, signPaymentProofUrl, PAYMENT_PROOF_FOLDER } from './proof-storage'

const uploadImage = vi.fn()
const signStoredImageUrl = vi.fn()

vi.mock('@/lib/storage/client', () => ({
  uploadImage: (...args: unknown[]) => uploadImage(...args),
  signStoredImageUrl: (...args: unknown[]) => signStoredImageUrl(...args),
}))

const STORED = {
  path: `${PAYMENT_PROOF_FOLDER}/PB-4G6JVH/proof.png`,
  fileId: 'file-123',
  url: 'https://ik.imagekit.io/testendpoint/payment-proofs/PB-4G6JVH/proof.png',
}

beforeEach(() => {
  vi.clearAllMocks()
  uploadImage.mockResolvedValue({ success: true, data: STORED })
  signStoredImageUrl.mockResolvedValue({ success: true, data: 'https://signed.example/proof' })
})

describe('uploadPaymentProof', () => {
  it('files the proof under the booking reference', async () => {
    await uploadPaymentProof({
      reference: 'PB-4G6JVH',
      extension: 'png',
      contentType: 'image/png',
      body: new ArrayBuffer(8),
    })

    expect(uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({
        folder: `${PAYMENT_PROOF_FOLDER}/PB-4G6JVH`,
        fileName: 'proof.png',
        contentType: 'image/png',
      }),
    )
  })

  it('stores the proof privately so it cannot be read without a signed link', async () => {
    await uploadPaymentProof({
      reference: 'PB-4G6JVH',
      extension: 'png',
      contentType: 'image/png',
      body: new ArrayBuffer(8),
    })

    expect(uploadImage).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: true }))
  })

  it('returns the stored path, which is what the payment row records', async () => {
    const result = await uploadPaymentProof({
      reference: 'PB-4G6JVH',
      extension: 'png',
      contentType: 'image/png',
      body: new ArrayBuffer(8),
    })

    expect(result).toEqual({ success: true, data: STORED.path })
  })

  it('passes the failure through rather than throwing when the store rejects it', async () => {
    uploadImage.mockResolvedValue({ success: false, error: 'over quota', code: 'STORAGE_ERROR' })

    const result = await uploadPaymentProof({
      reference: 'PB-4G6JVH',
      extension: 'png',
      contentType: 'image/png',
      body: new ArrayBuffer(8),
    })

    expect(result).toMatchObject({ success: false, code: 'STORAGE_ERROR' })
  })

  /**
   * The reference names the folder a file is written to. A caller that could
   * pass an arbitrary string could write outside the proofs tree entirely, so
   * this must fail closed rather than sanitise.
   */
  it('refuses a reference that is not a booking reference', async () => {
    await expect(
      uploadPaymentProof({
        reference: '../catalog',
        extension: 'png',
        contentType: 'image/png',
        body: new ArrayBuffer(8),
      }),
    ).rejects.toThrow(/untrusted/i)

    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('refuses an extension outside the allowed set', async () => {
    await expect(
      uploadPaymentProof({
        reference: 'PB-4G6JVH',
        extension: 'svg',
        contentType: 'image/svg+xml',
        body: new ArrayBuffer(8),
      }),
    ).rejects.toThrow(/untrusted/i)

    expect(uploadImage).not.toHaveBeenCalled()
  })
})

describe('signPaymentProofUrl', () => {
  it('returns a time-boxed link for the stored path', async () => {
    const result = await signPaymentProofUrl(STORED.path)

    expect(signStoredImageUrl).toHaveBeenCalledWith(STORED.path)
    expect(result).toEqual({ success: true, data: 'https://signed.example/proof' })
  })

  it('passes a signing failure through rather than throwing', async () => {
    signStoredImageUrl.mockResolvedValue({
      success: false,
      error: 'Could not open that image',
      code: 'STORAGE_ERROR',
    })

    expect(await signPaymentProofUrl(STORED.path)).toMatchObject({ success: false })
  })
})
