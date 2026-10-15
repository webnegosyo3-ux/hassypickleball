'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { useCart } from '../cart-provider'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { formatMoney } from '@/lib/format/money'
import { formatDayInZone, formatTimeInZone } from '@/lib/format/time'
import type { CartCourtLine, CartItemLine } from '@/lib/domain/cart'

/**
 * The cart, as a slide-over panel.
 *
 * A panel rather than a page: a customer comparing courts should be able to
 * check what they have picked without losing the court they were looking at.
 * It ends at a checkout button, which is a link rather than an action — the
 * cart is browser-side until the guest commits to it.
 */

export interface CartDrawerProps {
  readonly isOpen: boolean
  readonly onClose: () => void
}

/** Exported so the control that opens the drawer can point `aria-controls` at it. */
export const CART_DRAWER_ID = 'cart-drawer'

/**
 * Every line carries its own currency, so an empty cart has none to borrow.
 * Matches the single-club default used by the court cards.
 */
const FALLBACK_CURRENCY = 'PHP'

function courtWindow(line: CartCourtLine): string {
  const day = formatDayInZone(line.startsAt, line.timeZone)
  const from = formatTimeInZone(line.startsAt, line.timeZone)
  const to = formatTimeInZone(line.endsAt, line.timeZone)

  return `${day} · ${from} – ${to}`
}

function CourtRow({ line }: { readonly line: CartCourtLine }) {
  const { removeCourt } = useCart()

  return (
    <li className="flex items-start justify-between gap-3 border-b border-line py-4">
      <div className="min-w-0">
        <p className="text-[14px] font-bold text-ink">{line.courtName}</p>
        <p className="mt-0.5 text-[13px] text-muted">{courtWindow(line)}</p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <p className="text-[14px] font-bold tabular-nums text-ink">
          {formatMoney(line.priceCents, line.currency)}
        </p>
        <button
          type="button"
          // Named per court: several rows carry the same word otherwise.
          aria-label={`Remove ${line.courtName}`}
          onClick={() => removeCourt(line.courtId, line.startsAt)}
          className="text-[12px] font-semibold text-muted underline underline-offset-2 hover:text-danger"
        >
          Remove
        </button>
      </div>
    </li>
  )
}

function ItemRow({ line }: { readonly line: CartItemLine }) {
  const { setItemQuantity } = useCart()

  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-4">
      <p className="min-w-0 text-[14px] font-bold text-ink">{line.name}</p>

      <div className="flex shrink-0 items-center gap-3">
        <QuantityStepper
          label={line.name}
          quantity={line.quantity}
          onChange={(quantity) => setItemQuantity(line, quantity)}
        />
        <p className="min-w-[64px] text-right text-[14px] font-bold tabular-nums text-ink">
          {formatMoney(line.unitPriceCents * line.quantity, line.currency)}
        </p>
      </div>
    </li>
  )
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { cart, summary } = useCart()
  const closeRef = useRef<HTMLButtonElement>(null)

  // Escape is bound on the document rather than the panel: the panel holds
  // focus on open, but a click on the backdrop would otherwise strand the key.
  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) {
      closeRef.current?.focus()
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const isEmpty = cart.courts.length === 0 && cart.items.length === 0
  const currency = cart.courts[0]?.currency ?? cart.items[0]?.currency ?? FALLBACK_CURRENCY

  return (
    <div className="fixed inset-0 z-50">
      {/* Decorative: Escape and the close button are the accessible exits. */}
      <div aria-hidden onClick={onClose} className="absolute inset-0 bg-navy/40" />

      <div
        id={CART_DRAWER_ID}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        className="absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col bg-surface shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2
            id="cart-drawer-title"
            className="font-[family-name:var(--font-display)] text-[18px] font-bold tracking-[-0.02em] text-ink"
          >
            Your booking
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label="Close booking"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink"
          >
            ×
          </button>
        </div>

        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
            <p className="text-[15px] font-bold text-ink">Your booking is empty</p>
            <p className="text-[13px] text-muted">Pick a court and a start time to begin.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5">
            <ul>
              {cart.courts.map((line) => (
                <CourtRow key={`${line.courtId}-${line.startsAt.toISOString()}`} line={line} />
              ))}
              {cart.items.map((line) => (
                <ItemRow key={line.productId} line={line} />
              ))}
            </ul>
          </div>
        )}

        <div className="border-t border-line px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
              Total
            </p>
            <p
              data-testid="cart-total"
              className="font-[family-name:var(--font-display)] text-[20px] font-bold tabular-nums text-ink"
            >
              {formatMoney(summary.totalCents, currency)}
            </p>
          </div>

          {/* Closed on the way out: the panel is fixed-position, so leaving it
              open would cover the page the guest just navigated to. */}
          {isEmpty ? null : (
            <Link
              href="/checkout"
              onClick={onClose}
              className="mt-4 block rounded-[10px] bg-navy px-4 py-3 text-center text-[14px] font-bold text-white"
            >
              Checkout
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
