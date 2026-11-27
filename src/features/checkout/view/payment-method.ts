import type { PaymentMethod } from '@/lib/repositories/mappers'

/**
 * A published payment method, narrowed to what the browser may see.
 *
 * The settlement enum and the club id stay on the server: the form names a
 * published method by id, and the action resolves the rest.
 */
export type CheckoutPaymentMethod = {
  readonly id: string
  readonly label: string
  readonly accountName: string | null
  readonly accountNumber: string | null
  readonly instructions: string | null
  readonly qrImageUrl: string | null
  readonly requiresProof: boolean
}

export function publishPaymentMethod(method: PaymentMethod): CheckoutPaymentMethod {
  return {
    id: method.id,
    label: method.label,
    accountName: method.accountName,
    accountNumber: method.accountNumber,
    instructions: method.instructions,
    qrImageUrl: method.qrImageUrl,
    requiresProof: method.requiresProof,
  }
}
