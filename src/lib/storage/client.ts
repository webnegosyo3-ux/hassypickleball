import 'server-only'

import { err, ok, type Result } from '@/lib/api/result'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

/**
 * Image storage on Supabase Storage.
 *
 * Everything here runs on the server with the service-role client. Uploads are
 * proxied rather than sent straight from the browser, so the type and size
 * checks stay on the side of the boundary we control.
 *
 * Two buckets, created by the `storage_buckets` migration:
 *  - `catalog` is public: court, product, and payment-method images that every
 *    guest sees.
 *  - `payment-proofs` is private: a proof is a photo of someone's banking app,
 *    so staff open it through a signed link that expires.
 */

export const CATALOG_BUCKET = 'catalog'
export const PROOF_BUCKET = 'payment-proofs'

/** How long a link to a private file stays valid when staff open one. */
export const SIGNED_URL_TTL_SECONDS = 300

export type ImageUpload = {
  /** Folder path, e.g. `/payment-proofs/PB-4G6JVH`. */
  readonly folder: string
  readonly fileName: string
  readonly contentType: string
  readonly body: ArrayBuffer
  /** Private files go to the proofs bucket. True for anything guest-supplied. */
  readonly isPrivate: boolean
}

export type StoredImage = {
  /** Object path inside its bucket, which is what we persist for private files. */
  readonly path: string
  readonly url: string
}

export async function uploadImage(upload: ImageUpload): Promise<Result<StoredImage>> {
  const bucket = upload.isPrivate ? PROOF_BUCKET : CATALOG_BUCKET
  const path = objectPath(`${upload.folder}/${upload.fileName}`)

  try {
    const storage = createSupabaseAdminClient().storage.from(bucket)
    // One image per subject: re-submitting replaces rather than accumulating.
    const { error } = await storage.upload(path, upload.body, {
      contentType: upload.contentType,
      upsert: true,
    })

    if (error) {
      return err('Could not store that image', 'STORAGE_ERROR')
    }

    // Private files have no public URL; the path is what gets persisted.
    const url = upload.isPrivate ? path : storage.getPublicUrl(path).data.publicUrl

    return ok({ path, url })
  } catch {
    return err('Could not reach the image store', 'STORAGE_ERROR')
  }
}

/** A time-boxed link to a private file, for staff reviewing a proof. */
export async function signStoredImageUrl(path: string): Promise<Result<string>> {
  try {
    const { data, error } = await createSupabaseAdminClient()
      .storage.from(PROOF_BUCKET)
      .createSignedUrl(objectPath(path), SIGNED_URL_TTL_SECONDS)

    if (error || !data) {
      return err('Could not open that image', 'STORAGE_ERROR')
    }

    return ok(data.signedUrl)
  } catch {
    return err('Could not open that image', 'STORAGE_ERROR')
  }
}

/**
 * Strips the leading slash and refuses anything that could climb out of the
 * folder: these strings are built from booking references and club ids, so
 * anything outside this set means a caller passed through input it did not
 * construct.
 */
function objectPath(path: string): string {
  const trimmed = path.replace(/^\/+/, '')

  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed) || trimmed.includes('..')) {
    throw new Error('Refusing to use an untrusted image path')
  }

  return trimmed
}
