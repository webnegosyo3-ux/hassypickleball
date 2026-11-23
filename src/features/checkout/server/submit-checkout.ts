import 'server-only'

import { uploadPaymentProof } from './proof-storage'
import { createBooking, type CreatedBooking } from '@/features/booking/server/create-booking'
import { err, ok, type Result } from '@/lib/api/result'
import { checkoutSchema } from '@/lib/api/schemas'
import { validatePaymentProof, type ProofFile } from '@/lib/domain/payment-proof'
import { findActivePaymentMethod } from '@/lib/repositories/payment-methods'
import { attachPaymentProof } from '@/lib/repositories/payments'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import type { PaymentMethod } from '@/lib/repositories/mappers'

/**
 * Guest checkout, end to end.
 *
 * Takes FormData rather than a plain object because a payment screenshot rides
 * along with the order, and multipart is the only way a file crosses a server
 * action boundary.
 *
 * The order of operations is the interesting part. Everything that can be
 * checked without a write — the schema, the payment method, the file's type and
 * size — is checked first, so an invalid checkout never holds a court. The
 * upload happens last, because it needs the booking reference to file under.
 */

export type CheckoutResult = {
  readonly reference: string
  readonly status: string
  readonly totalCents: number
  readonly paymentMethodLabel: string
  /** False when the guest owes the desk a screenshot after all — see below. */
  readonly proofAttached: boolean
}

/** The subset of File this module uses, so the boundary is not browser-typed. */
type UploadedFile = ProofFile & { arrayBuffer: () => Promise<ArrayBuffer> }

function readOrder(form: FormData): unknown {
  const raw = form.get('order')

  if (typeof raw !== 'string') {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/**
 * A file only if it is one. Duck-typed rather than `instanceof File`: what
 * arrives here is a server-side Blob-alike, and an empty form field comes
 * through as the string "undefined" often enough to be worth guarding.
 */
function readProof(form: FormData): UploadedFile | null {
  const raw = form.get('proof')

  if (!raw || typeof raw === 'string' || typeof raw.arrayBuffer !== 'function') {
    return null
  }

  return raw as unknown as UploadedFile
}

export async function submitCheckout(form: FormData): Promise<Result<CheckoutResult>> {
  const parsed = checkoutSchema.safeParse(readOrder(form))

  if (!parsed.success) {
    return err(parsed.error.issues[0]?.message ?? 'Please check your details', 'INVALID')
  }

  const order = parsed.data
  const client = createSupabaseAdminClient()

  const method = await findActivePaymentMethod(client, order.clubId, order.paymentMethodId)

  if (!method) {
    return err('That payment method is no longer available. Please pick another.', 'INVALID')
  }

  const proof = readProof(form)
  const validated = validateProofFor(method, proof)

  if (!validated.success) {
    return validated
  }

  const booked = await createBooking({
    clubId: order.clubId,
    contactName: order.contactName,
    contactEmail: order.contactEmail,
    contactPhone: order.contactPhone,
    willPresentId: order.willPresentId,
    notes: order.notes,
    courts: order.courts,
    items: order.items,
    players: order.players,
    // The published method resolves to the enum the payment row is filed under,
    // so a client cannot name a channel the club does not accept.
    paymentMethod: method.method,
  })

  if (!booked.success) {
    return booked
  }

  const summary = booked.data

  if (!proof || !validated.data) {
    return ok(toResult(summary, method, false))
  }

  const stored = await storeProof(client, summary, proof, validated.data.extension)

  return ok(toResult(summary, method, stored))
}

/**
 * Whether this checkout may proceed without a screenshot.
 *
 * A method that settles at the desk has nothing to screenshot yet; a transfer
 * has, and letting one through without would leave staff with a booking they
 * cannot reconcile.
 */
function validateProofFor(
  method: PaymentMethod,
  proof: UploadedFile | null,
): Result<{ readonly extension: string } | null> {
  if (!proof) {
    return method.requiresProof
      ? err(`Please attach a screenshot of your ${method.label} payment`, 'PROOF_REQUIRED')
      : ok(null)
  }

  const validated = validatePaymentProof(proof)

  return validated.success ? ok({ extension: validated.data.extension }) : validated
}

/**
 * Stores the proof and links it to the payment. Reports whether it landed.
 *
 * Failure here is deliberately not fatal. By this point the court is held and
 * the reference is issued; throwing that away because object storage blinked
 * would cost the guest their slot over a file they can simply send to the desk.
 * The thank-you screen says so rather than implying the proof is on file.
 */
async function storeProof(
  client: ReturnType<typeof createSupabaseAdminClient>,
  booking: CreatedBooking,
  proof: UploadedFile,
  extension: string,
): Promise<boolean> {
  try {
    const stored = await uploadPaymentProof({
      reference: booking.reference,
      extension,
      contentType: proof.type,
      body: await proof.arrayBuffer(),
    })

    if (!stored.success) {
      console.error('[storeProof] uploadPaymentProof failed:', stored.error)
      return false
    }

    await attachPaymentProof(client, booking.id, stored.data)

    return true
  } catch (err) {
    console.error('[storeProof] Failed to store payment proof:', err)
    return false
  }
}

function toResult(
  summary: CreatedBooking,
  method: PaymentMethod,
  proofAttached: boolean,
): CheckoutResult {
  return {
    reference: summary.reference,
    status: summary.status,
    totalCents: summary.totalCents,
    paymentMethodLabel: method.label,
    proofAttached,
  }
}
