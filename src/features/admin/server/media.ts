import 'server-only'

import { invalid, withStaff } from './session'
import { err, ok, type Result } from '@/lib/api/result'
import {
  buildCatalogImagePath,
  validateImage,
  type CatalogSubject,
  type ImageFile,
} from '@/lib/domain/image-upload'
import { uploadImage } from '@/lib/storage/client'

/**
 * Catalog image uploads, for the product, court, and payment-method editors.
 *
 * Takes FormData because a file is the point, and multipart is the only way one
 * crosses a server action boundary. Everything checkable without a write — the
 * subject, the id, the file's type and size — is checked first, so a rejected
 * image never reaches the image store.
 *
 * `clubId` is never read from the request. It comes from the staff session, so
 * a staff member of one club cannot write into another's folder — a filter the
 * caller controls would be no boundary at all.
 */

const SUBJECTS: readonly CatalogSubject[] = ['product', 'court', 'payment-method']

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type UploadedCatalogImage = {
  /** Delivery URL, which is what the catalog row stores. */
  readonly url: string
  /** Storage path, kept so the image can be replaced or removed later. */
  readonly path: string
}

/** The subset of File this module uses, so the boundary is not browser-typed. */
type UploadedFile = ImageFile & { arrayBuffer: () => Promise<ArrayBuffer> }

export async function uploadCatalogImage(form: FormData): Promise<Result<UploadedCatalogImage>> {
  const subject = form.get('subject')
  const id = form.get('id')

  if (typeof subject !== 'string' || !isSubject(subject)) {
    return invalid('That is not something an image can be attached to')
  }

  // Checked here rather than left to buildCatalogImagePath, so a malformed
  // request reads as a rejected upload instead of relying on a throw being
  // caught further in.
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    return invalid('Pick what the image belongs to first')
  }

  const file = readFile(form)

  if (!file) {
    return invalid('Please choose an image to upload')
  }

  const validated = validateImage(file)

  if (!validated.success) {
    return err(validated.error, 'INVALID')
  }

  return withStaff(async ({ staff }) => {
    // Throws on an id that is not one we issued; caught below so a malformed
    // request reads as a rejected upload rather than a crash.
    const path = buildCatalogImagePath({
      clubId: staff.clubId,
      subject,
      id,
      extension: validated.data.extension,
    })

    const stored = await uploadImage({
      folder: folderOf(path),
      fileName: fileNameOf(path),
      contentType: validated.data.contentType,
      body: await file.arrayBuffer(),
      // Catalog images are rendered to guests, so they are public. Only proofs
      // are private.
      isPrivate: false,
    })

    if (!stored.success) {
      return stored
    }

    return ok({ url: stored.data.url, path: stored.data.path })
  }).then(flatten)
}

/**
 * `withStaff` wraps whatever the callback returns in its own Ok, so a Result
 * returned from inside arrives nested one level deep.
 */
function flatten(outer: Result<Result<UploadedCatalogImage>>): Result<UploadedCatalogImage> {
  return outer.success ? outer.data : outer
}

function isSubject(value: string): value is CatalogSubject {
  return (SUBJECTS as readonly string[]).includes(value)
}

/**
 * A file only if it is one. Duck-typed rather than `instanceof File`: what
 * arrives here is a server-side Blob-alike, and an empty form field comes
 * through as the string "undefined" often enough to be worth guarding.
 */
function readFile(form: FormData): UploadedFile | null {
  const raw = form.get('file')

  if (!raw || typeof raw === 'string' || typeof raw.arrayBuffer !== 'function') {
    return null
  }

  return raw as unknown as UploadedFile
}

function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'))
}

function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
