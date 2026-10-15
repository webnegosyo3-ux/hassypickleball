'use server'

/**
 * The admin feature's server-action surface.
 *
 * Thin on purpose, matching src/features/booking/actions.ts: every action
 * delegates to a plain module under ./server, which is unit-testable without a
 * Next.js request. Authorisation is not repeated here — each module runs inside
 * withStaff, so an action that forgot the gate could not reach a repository.
 */

import { markBookingPaid, refundBookingPayment, type PaidResult } from './server/payments'
import { setBookingStatus } from './server/bookings'
import { blockCourtTime, removeCourtBlock } from './server/blocks'
import { saveProduct } from './server/catalog'
import { saveClubSettings } from './server/club'
import { saveCourt } from './server/courts'
import { uploadCatalogImage, type UploadedCatalogImage } from './server/media'
import {
  movePublishedPaymentMethod,
  savePaymentMethod,
  type MovedPaymentMethod,
} from './server/payment-methods'
import type { AvailabilityBlock, Booking, Payment } from '@/lib/repositories/booking-mappers'
import type { Club, Court, PaymentMethod, Product } from '@/lib/repositories/mappers'
import type { Result } from '@/lib/api/result'

export async function markBookingPaidAction(input: unknown): Promise<Result<PaidResult>> {
  return markBookingPaid(input)
}

export async function refundPaymentAction(input: unknown): Promise<Result<Payment>> {
  return refundBookingPayment(input)
}

export async function setBookingStatusAction(input: unknown): Promise<Result<Booking>> {
  return setBookingStatus(input)
}

export async function blockCourtTimeAction(input: unknown): Promise<Result<AvailabilityBlock>> {
  return blockCourtTime(input)
}

export async function removeCourtBlockAction(input: unknown): Promise<Result<{ blockId: string }>> {
  return removeCourtBlock(input)
}

export async function saveProductAction(input: unknown): Promise<Result<Product>> {
  return saveProduct(input)
}

export async function saveClubSettingsAction(input: unknown): Promise<Result<Club>> {
  return saveClubSettings(input)
}

export async function saveCourtAction(input: unknown): Promise<Result<Court>> {
  return saveCourt(input)
}

export async function savePaymentMethodAction(input: unknown): Promise<Result<PaymentMethod>> {
  return savePaymentMethod(input)
}

export async function movePaymentMethodAction(input: unknown): Promise<Result<MovedPaymentMethod>> {
  return movePublishedPaymentMethod(input)
}

/** Takes FormData rather than a plain object: the payload is a file. */
export async function uploadCatalogImageAction(
  form: FormData,
): Promise<Result<UploadedCatalogImage>> {
  return uploadCatalogImage(form)
}
