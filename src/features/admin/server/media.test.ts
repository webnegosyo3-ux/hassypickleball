import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadCatalogImage } from './media'

const uploadImage = vi.fn()
const withStaff = vi.fn()

vi.mock('@/lib/storage/client', () => ({
  uploadImage: (...args: unknown[]) => uploadImage(...args),
}))

vi.mock('./session', async () => {
  const actual = await vi.importActual<typeof import('./session')>('./session')

  return { ...actual, withStaff: (...args: unknown[]) => withStaff(...args) }
})

const CLUB_ID = '3f8a1c2e-0000-4000-8000-000000000001'
const PRODUCT_ID = '3f8a1c2e-0000-4000-8000-000000000002'

const STORED = {
  path: `/catalog/${CLUB_ID}/product/${PRODUCT_ID}.png`,
  fileId: 'file-1',
  url: `https://ik.imagekit.io/testendpoint/catalog/${CLUB_ID}/product/${PRODUCT_ID}.png`,
}

/**
 * A real File, because FormData is part of what is under test: setting a plain
 * object on a form field stringifies it, which is exactly the case `readFile`
 * has to reject.
 */
function imageFile(overrides: Partial<{ type: string; size: number }> = {}) {
  const size = overrides.size ?? 2048

  return new File([new Uint8Array(size)], 'racket.png', {
    type: overrides.type ?? 'image/png',
  })
}

function formFor(
  file: unknown = imageFile(),
  fields: Record<string, string> = { subject: 'product', id: PRODUCT_ID },
): FormData {
  const form = new FormData()

  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value)
  }

  if (file !== null) {
    form.set('file', file as Blob)
  }

  return form
}

beforeEach(() => {
  vi.clearAllMocks()
  uploadImage.mockResolvedValue({ success: true, data: STORED })
  // Stands in for a signed-in staff member of CLUB_ID.
  withStaff.mockImplementation(async (run: (context: unknown) => Promise<unknown>) => ({
    success: true,
    data: await run({ staff: { clubId: CLUB_ID }, client: {} }),
  }))
})

describe('uploadCatalogImage', () => {
  it('returns the delivery URL the catalog row should store', async () => {
    const result = await uploadCatalogImage(formFor())

    expect(result).toMatchObject({ success: true, data: { url: STORED.url } })
  })

  it('files the image under the club from the session', async () => {
    await uploadCatalogImage(formFor())

    expect(uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ folder: `/catalog/${CLUB_ID}/product` }),
    )
  })

  /**
   * The club is taken from the session, never the request. A staff member of
   * one club must not be able to write into another club's folder.
   */
  it('ignores a club id supplied by the caller', async () => {
    const attacker = '3f8a1c2e-0000-4000-8000-0000000000ff'

    await uploadCatalogImage(
      formFor(imageFile(), { subject: 'product', id: PRODUCT_ID, clubId: attacker }),
    )

    expect(uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ folder: `/catalog/${CLUB_ID}/product` }),
    )
  })

  it('stores a catalog image publicly, since it is rendered to guests', async () => {
    await uploadCatalogImage(formFor())

    expect(uploadImage).toHaveBeenCalledWith(expect.objectContaining({ isPrivate: false }))
  })

  it('refuses when no one is signed in', async () => {
    withStaff.mockResolvedValue({ success: false, error: 'not signed in', code: 'UNAUTHORIZED' })

    const result = await uploadCatalogImage(formFor())

    expect(result).toMatchObject({ success: false, code: 'UNAUTHORIZED' })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('rejects a file that is not an image before anything is uploaded', async () => {
    const result = await uploadCatalogImage(formFor(imageFile({ type: 'application/pdf' })))

    expect(result).toMatchObject({ success: false, code: 'INVALID' })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('rejects an SVG, which a browser would execute', async () => {
    const result = await uploadCatalogImage(formFor(imageFile({ type: 'image/svg+xml' })))

    expect(result).toMatchObject({ success: false, code: 'INVALID' })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('rejects a file over the size limit before anything is uploaded', async () => {
    const result = await uploadCatalogImage(formFor(imageFile({ size: 6 * 1024 * 1024 })))

    expect(result).toMatchObject({ success: false, code: 'INVALID' })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('rejects a request with no file attached', async () => {
    const result = await uploadCatalogImage(formFor(null))

    expect(result).toMatchObject({ success: false, code: 'INVALID' })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('rejects a subject it does not recognise', async () => {
    const result = await uploadCatalogImage(
      formFor(imageFile(), { subject: 'invoices', id: PRODUCT_ID }),
    )

    expect(result).toMatchObject({ success: false, code: 'INVALID' })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('rejects a subject id that is not a uuid', async () => {
    const result = await uploadCatalogImage(
      formFor(imageFile(), { subject: 'product', id: '../../payment-proofs' }),
    )

    expect(result).toMatchObject({ success: false, code: 'INVALID' })
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('reports a storage failure rather than throwing', async () => {
    uploadImage.mockResolvedValue({ success: false, error: 'over quota', code: 'STORAGE_ERROR' })

    const result = await uploadCatalogImage(formFor())

    expect(result).toMatchObject({ success: false, code: 'STORAGE_ERROR' })
  })
})
