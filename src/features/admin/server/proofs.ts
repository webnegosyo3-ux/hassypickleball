import 'server-only'

import { bookingProofsSchema } from '@/lib/api/admin-schemas'
import { ok, type Result } from '@/lib/api/result'
import { signPaymentProofUrl } from '@/features/checkout/server/proof-storage'
import { loadBookingDetail } from '@/lib/repositories/bookings'
import { findClubById } from '@/lib/repositories/clubs'
import { invalid, withStaff } from './session'
import {
  toPaymentProofs,
  type PaymentLine,
  type ProofFailures,
  type SignedProofUrls,
} from '../view/bookings'

/**
 * Proofs live in a private bucket, so a link to one is signed per request and
 * expires. Signing happens on the server because it needs the storage secret; a
 * path that fails to sign is simply left out of the map, and the console renders
 * the payment as "proof on file, could not be opened" rather than a link that
 * 403s in a new tab.
 *
 * Kept in one place because two screens now show proofs — the ledger's Payment
 * column and the booking's own page — and they must agree about which ones are
 * readable.
 *
 * A path that fails to sign comes back with the reason attached instead of
 * being dropped: "the storage secret is not set", "the bucket is gone" and
 * "that file is not there" are three different jobs for whoever has to fix it,
 * and the console used to report all of them as "could not be opened".
 */
export async function signPaymentProofs(
  payments: readonly { readonly proofUrl: string | null }[],
): Promise<{ readonly urls: SignedProofUrls; readonly failures: ProofFailures }> {
  const paths = [
    ...new Set(payments.flatMap((payment) => (payment.proofUrl ? [payment.proofUrl] : []))),
  ]

  const signed = await Promise.all(
    paths.map(async (path) => [path, await signPaymentProofUrl(path)] as const),
  )

  const urls: Record<string, string> = {}
  const failures: Record<string, string> = {}

  for (const [path, result] of signed) {
    if (result.success) {
      urls[path] = result.data
      continue
    }

    failures[path] = result.error
  }

  return { urls, failures }
}

const MISSING_MESSAGE = 'That booking is no longer there'

/**
 * The proofs on one booking, signed, for the ledger's preview dialog.
 *
 * The Bookings list deliberately does not sign as it renders: that screen shows
 * a month of bookings, and signing every row's proof would be a storage call
 * per row to show images the desk usually never opens. The dialog asks here
 * instead, so the cost is paid once, for the booking someone is checking.
 *
 * The payment arrives with the amount and method it was recorded with, because
 * the check the desk is making is whether the photograph agrees with both.
 */
export async function loadBookingProofs(input: unknown): Promise<Result<readonly PaymentLine[]>> {
  const parsed = bookingProofsSchema.safeParse(input)

  if (!parsed.success) {
    return invalid(MISSING_MESSAGE)
  }

  const { bookingId } = parsed.data

  const outer = await withStaff(async ({ staff, client }) => {
    // RLS decides which bookings exist for this staff member, so another club's
    // id and a deleted booking both arrive here as nothing.
    const detail = await loadBookingDetail(client, bookingId)

    if (!detail) {
      return invalid(MISSING_MESSAGE)
    }

    const club = await findClubById(client, staff.clubId)

    if (!club) {
      return invalid(MISSING_MESSAGE)
    }

    const signed = await signPaymentProofs(detail.payments)

    return toPaymentProofs(detail.payments, club, signed)
  })

  return flatten(outer)
}

/**
 * `withStaff` wraps whatever the callback returns in its own Ok, so a refusal
 * returned from inside arrives nested one level deep. Mirrors ./bookings.ts.
 */
function flatten(
  outer: Result<Result<never> | readonly PaymentLine[]>,
): Result<readonly PaymentLine[]> {
  if (!outer.success) {
    return outer
  }

  const inner = outer.data

  return isRefusal(inner) ? inner : ok(inner)
}

function isRefusal(value: Result<never> | readonly PaymentLine[]): value is Result<never> {
  return 'success' in value && value.success === false
}
