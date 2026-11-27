import 'server-only'

import { err, ok, type Result } from '@/lib/api/result'
import { hasServerSecret } from '@/lib/env'
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

  // Same missing-secret case as signing, and the same reason for naming it in
  // the log: "could not reach the image store" reads like an outage.
  if (!hasServerSecret()) {
    console.error(
      `[storage] Cannot upload to '${bucket}/${path}': SUPABASE_SERVICE_ROLE_KEY is empty.`,
    )

    return err('Image storage is not configured on this server', 'STORAGE_NOT_CONFIGURED')
  }

  try {
    const admin = createSupabaseAdminClient()
    const storage = admin.storage.from(bucket)
    const fileBody = Buffer.isBuffer(upload.body) ? upload.body : Buffer.from(upload.body)

    // One image per subject: re-submitting replaces rather than accumulating.
    let { error } = await storage.upload(path, fileBody, {
      contentType: upload.contentType,
      upsert: true,
    })

    if (error) {
      console.warn(
        `[storage] Upload to '${bucket}/${path}' returned error:`,
        error.message ?? error,
      )
      await ensureBucket(admin, bucket, upload.isPrivate)
      const retry = await storage.upload(path, fileBody, {
        contentType: upload.contentType,
        upsert: true,
      })
      error = retry.error
    }

    if (error) {
      console.error(`[storage] Final upload failure for '${bucket}/${path}':`, error)
      return err('Could not store that image', 'STORAGE_ERROR')
    }

    // Private files have no public URL; the path is what gets persisted.
    const url = upload.isPrivate ? path : storage.getPublicUrl(path).data.publicUrl

    return ok({ path, url })
  } catch (errCatch) {
    console.error(`[storage] Exception during uploadImage for '${bucket}/${path}':`, errCatch)
    return err('Could not reach the image store', 'STORAGE_ERROR')
  }
}

async function ensureBucket(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string,
  isPrivate: boolean,
): Promise<void> {
  try {
    const { data, error } = await admin.storage.getBucket(bucket)
    if (!data || error) {
      const { error: createError } = await admin.storage.createBucket(bucket, {
        public: !isPrivate,
        fileSizeLimit: 5242880,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'],
      })
      if (createError && !createError.message?.toLowerCase().includes('already exists')) {
        console.warn(`[storage] createBucket error for '${bucket}':`, createError)
      }
    }
  } catch (e) {
    console.warn(`[storage] ensureBucket error for '${bucket}':`, e)
  }
}

/** A time-boxed link to a private file, for staff reviewing a proof. */
export async function signStoredImageUrl(path: string): Promise<Result<string>> {
  // Checked before the client is built, because createSupabaseAdminClient()
  // throws a developer's stack trace and the caller has a staff member waiting.
  // This is also the one storage failure worth naming precisely: it is a
  // deployment that is missing a secret, not a proof that has gone astray.
  if (!hasServerSecret()) {
    console.error(
      '[storage] Cannot sign a proof: SUPABASE_SERVICE_ROLE_KEY is empty. The console will report proofs as unreadable until it is set.',
    )

    return err(
      'Payment proofs cannot be opened yet: SUPABASE_SERVICE_ROLE_KEY is not set on this server. Add it and restart.',
      'STORAGE_NOT_CONFIGURED',
    )
  }

  try {
    const { data, error } = await createSupabaseAdminClient()
      .storage.from(PROOF_BUCKET)
      .createSignedUrl(objectPath(path), SIGNED_URL_TTL_SECONDS)

    if (error || !data) {
      // Logged with the object key: the staff member gets a sentence, whoever
      // runs the server gets the thing to grep for.
      console.error(`[storage] Could not sign '${PROOF_BUCKET}/${path}':`, error ?? 'no data')

      return err(signingFailure(error), 'STORAGE_ERROR')
    }

    return ok(data.signedUrl)
  } catch (cause) {
    console.error(`[storage] Exception while signing '${PROOF_BUCKET}/${path}':`, cause)

    return err('Could not reach the image store', 'STORAGE_ERROR')
  }
}

/**
 * What to tell the desk when a signature could not be produced.
 *
 * Supabase answers a missing object, a missing bucket, and an empty key with
 * much the same shape, and "could not be opened" sends people to look at the
 * wrong thing. The bucket case is checked first because its message contains
 * "not found" too.
 */
function signingFailure(
  error: { readonly message?: string; readonly statusCode?: string } | null,
): string {
  const message = (error?.message ?? '').toLowerCase()

  if (message.includes('bucket')) {
    return `The ${PROOF_BUCKET} storage bucket is missing. Apply the storage migration, then try again.`
  }

  if (message.includes('not found') || error?.statusCode === '404') {
    return 'That proof is no longer in storage — the payment row still points at it.'
  }

  return 'Could not open that image.'
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
