import { rangesOverlap } from './time'
import type { CourtCapacity } from './pax'
import type { CartItem, CourtSelection } from './types'

export type CartSummary = {
  readonly courtsSubtotalCents: number
  readonly itemsSubtotalCents: number
  readonly totalCents: number
  readonly courtCount: number
  readonly itemCount: number
  readonly startsAt: Date | null
  readonly endsAt: Date | null
}

/**
 * A court as the cart holds it: the selection the pricing code needs, plus what
 * it takes to render the line. The cart is shown from the site header, which
 * has no club in scope, so the club's name for the court and the lens its times
 * and prices must be read through travel with the line rather than being looked
 * up again at render time.
 */
export type CartCourtLine = CourtSelection & {
  readonly courtName: string
  readonly timeZone: string
  readonly currency: string
} & Partial<CourtCapacity>

/** Likewise for an add-on: the price is meaningless without its currency. */
export type CartItemLine = CartItem & {
  readonly currency: string
}

export type Cart = {
  readonly courts: readonly CartCourtLine[]
  readonly items: readonly CartItemLine[]
}

/**
 * Arithmetic needs only the priced fields, so a server-side quote — which has
 * no display context — can be summarised with the same function as the cart.
 */
type PricedCart = {
  readonly courts: readonly CourtSelection[]
  readonly items: readonly CartItem[]
}

export function summariseCart(cart: PricedCart): CartSummary {
  const courtsSubtotalCents = cart.courts.reduce((sum, court) => sum + court.priceCents, 0)
  const itemsSubtotalCents = cart.items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  )

  const startTimes = cart.courts.map((court) => court.startsAt.getTime())
  const endTimes = cart.courts.map((court) => court.endsAt.getTime())

  return {
    courtsSubtotalCents,
    itemsSubtotalCents,
    totalCents: courtsSubtotalCents + itemsSubtotalCents,
    courtCount: cart.courts.length,
    itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    startsAt: startTimes.length > 0 ? new Date(Math.min(...startTimes)) : null,
    endsAt: endTimes.length > 0 ? new Date(Math.max(...endTimes)) : null,
  }
}

/**
 * Adds a court segment. Rejects a segment that collides with one already in the
 * cart — the database would reject it later anyway, and failing here lets the
 * UI say so before checkout.
 */
export function addCourtToCart<T extends CourtSelection>(courts: readonly T[], selection: T): T[] {
  const conflict = courts.some(
    (court) => court.courtId === selection.courtId && rangesOverlap(court, selection),
  )

  if (conflict) {
    throw new Error('That court and time is already in your booking')
  }

  return [...courts, selection]
}

export function removeCourtFromCart<T extends CourtSelection>(
  courts: readonly T[],
  target: { readonly courtId: string; readonly startsAt: Date },
): T[] {
  return courts.filter(
    (court) =>
      court.courtId !== target.courtId || court.startsAt.getTime() !== target.startsAt.getTime(),
  )
}

/** Sets a line's quantity. A quantity of zero or less removes the line. */
export function setItemQuantity<T extends CartItem>(
  items: readonly T[],
  productId: string,
  quantity: number,
): T[] {
  if (quantity <= 0) {
    return items.filter((item) => item.productId !== productId)
  }

  return items.map((item) => (item.productId === productId ? { ...item, quantity } : item))
}
