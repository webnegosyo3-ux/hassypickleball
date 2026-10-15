import 'server-only'

import { err, ok, type Result } from '@/lib/api/result'
import { buildPaymentProofPath } from '@/lib/domain/payment-proof'
import { signStoredImageUrl, uploadImage } from '@/lib/storage/client'

/**
 * Where proofs of payment live.
 *
 * Uploaded private and written only from here on the server: a store a browser
 * can write to directly is an anonymous file drop. The desk reads a proof back
 * through a signed URL that expires, because the image is a photograph of
 * someone's banking app and a permanent link to one is a liability.
 */

export const PAYMENT_PROOF_FOLDER = '/payment-proofs'

export type ProofUpload = {
  /** Booking reference, e.g. `PB-4G6JVH`. Names the folder. */
  readonly reference: string
  readonly extension: string
  readonly contentType: string
  readonly body: ArrayBuffer
}

/** Returns the stored path, or the reason it could not be stored. */
export async function uploadPaymentProof(upload: ProofUpload): Promise<Result<string>> {
  // Throws on anything that is not a reference we issued. Deliberately ahead of
  // the upload: this string decides which folder gets written to.
  const relativePath = buildPaymentProofPath(upload.reference, upload.extension)
  const [folder, fileName] = splitPath(relativePath)

  const stored = await uploadImage({
    folder: `${PAYMENT_PROOF_FOLDER}/${folder}`,
    fileName,
    contentType: upload.contentType,
    body: upload.body,
    isPrivate: true,
  })

  if (!stored.success) {
    return err(stored.error, stored.code)
  }

  return ok(stored.data.path)
}

/** A time-boxed link for staff reviewing a payment in the admin console. */
export function signPaymentProofUrl(path: string): Promise<Result<string>> {
  return signStoredImageUrl(path)
}

/**
 * `PB-4G6JVH/proof.png` -> folder and file name, which the upload API takes
 * separately. Safe to split on the last slash: the path came from
 * buildPaymentProofPath, which produces exactly one.
 */
function splitPath(path: string): readonly [string, string] {
  const index = path.lastIndexOf('/')

  return [path.slice(0, index), path.slice(index + 1)]
}
