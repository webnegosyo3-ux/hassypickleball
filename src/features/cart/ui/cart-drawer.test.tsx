import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CartDrawer } from './cart-drawer'
import { CartProvider } from '../cart-provider'
import { resetCartSnapshot, writeStoredCart } from '../cart-store'
import type { Cart, CartCourtLine, CartItemLine } from '@/lib/domain/cart'

/**
 * The cart drawer is the only place a customer can see what they have picked.
 * Everything it needs to render a line — the court's name, the club's timezone
 * and currency — is stored on the line itself, so the drawer can live in the
 * site header without the header fetching a club.
 */

const COURT: CartCourtLine = {
  courtId: 'court-1',
  courtName: 'Court 3',
  startsAt: new Date('2026-08-08T06:00:00.000Z'),
  endsAt: new Date('2026-08-08T07:00:00.000Z'),
  priceCents: 60000,
  timeZone: 'Asia/Manila',
  currency: 'PHP',
}

const ITEM: CartItemLine = {
  productId: 'gatorade',
  name: 'Gatorade',
  unitPriceCents: 9000,
  quantity: 2,
  currency: 'PHP',
}

function renderDrawer(cart: Partial<Cart> = {}, onClose = vi.fn()) {
  writeStoredCart({ courts: [], items: [], ...cart })
  resetCartSnapshot()

  render(
    <CartProvider>
      <CartDrawer isOpen onClose={onClose} />
    </CartProvider>,
  )

  return { onClose }
}

afterEach(() => {
  window.localStorage.clear()
  resetCartSnapshot()
})

describe('CartDrawer', () => {
  it('renders nothing while closed so the page underneath keeps its focus order', () => {
    writeStoredCart({ courts: [COURT], items: [] })
    resetCartSnapshot()

    render(
      <CartProvider>
        <CartDrawer isOpen={false} onClose={vi.fn()} />
      </CartProvider>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exposes the open panel as a modal dialog named for the cart', () => {
    renderDrawer({ courts: [COURT] })

    const dialog = screen.getByRole('dialog', { name: /your booking/i })

    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('says the cart is empty rather than showing a bare panel', () => {
    renderDrawer()

    expect(screen.getByRole('dialog')).toHaveTextContent(/your booking is empty/i)
  })

  it('names the booked court', () => {
    renderDrawer({ courts: [COURT] })

    expect(screen.getByText('Court 3')).toBeInTheDocument()
  })

  it('shows a court window in the club timezone, not the viewer wall clock', () => {
    renderDrawer({ courts: [COURT] })

    // 06:00Z is 2:00 PM in Manila; a UTC-rendered drawer would say 6:00 AM.
    expect(screen.getByText(/Sat, 08 Aug 2026/)).toHaveTextContent('2:00 PM – 3:00 PM')
  })

  it('prices a court line in the club currency', () => {
    renderDrawer({ courts: [COURT] })

    // Scoped to the row: with one line the cart total reads the same.
    expect(within(screen.getByRole('listitem')).getByText('₱600')).toBeInTheDocument()
  })

  it('drops a court line when its remove button is pressed', async () => {
    const user = userEvent.setup()
    renderDrawer({ courts: [COURT] })

    await user.click(screen.getByRole('button', { name: 'Remove Court 3' }))

    expect(screen.queryByText('Court 3')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent(/your booking is empty/i)
  })

  it('removes only the pressed court when the same court is held at two times', async () => {
    const user = userEvent.setup()
    const later: CartCourtLine = {
      ...COURT,
      courtName: 'Court 4',
      startsAt: new Date('2026-08-08T08:00:00.000Z'),
      endsAt: new Date('2026-08-08T09:00:00.000Z'),
    }
    renderDrawer({ courts: [COURT, later] })

    await user.click(screen.getByRole('button', { name: 'Remove Court 3' }))

    expect(screen.queryByText('Court 3')).not.toBeInTheDocument()
    expect(screen.getByText('Court 4')).toBeInTheDocument()
  })

  it('prices an add-on line at quantity times unit price', () => {
    renderDrawer({ items: [ITEM] })

    expect(within(screen.getByRole('listitem')).getByText('₱180')).toBeInTheDocument()
  })

  it('raises an add-on quantity from the drawer', async () => {
    const user = userEvent.setup()
    renderDrawer({ items: [ITEM] })

    await user.click(screen.getByRole('button', { name: 'Increase Gatorade' }))

    expect(within(screen.getByRole('listitem')).getByText('₱270')).toBeInTheDocument()
  })

  it('removes an add-on line once its quantity reaches zero', async () => {
    const user = userEvent.setup()
    renderDrawer({ items: [{ ...ITEM, quantity: 1 }] })

    await user.click(screen.getByRole('button', { name: 'Decrease Gatorade' }))

    expect(screen.queryByText('Gatorade')).not.toBeInTheDocument()
  })

  it('totals court time and add-ons together', () => {
    renderDrawer({ courts: [COURT], items: [ITEM] })

    expect(screen.getByTestId('cart-total')).toHaveTextContent('₱780')
  })

  it('closes when the close button is pressed', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer({ courts: [COURT] })

    await user.click(screen.getByRole('button', { name: /close booking/i }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape, the shortcut a modal is expected to honour', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer({ courts: [COURT] })

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('moves focus into the panel on open so the keyboard lands inside the dialog', () => {
    renderDrawer({ courts: [COURT] })

    expect(screen.getByRole('button', { name: /close booking/i })).toHaveFocus()
  })
})

describe('checkout', () => {
  it('offers a way to check out once there is something in the cart', () => {
    renderDrawer({ courts: [COURT] })

    expect(screen.getByRole('link', { name: /checkout/i })).toHaveAttribute('href', '/checkout')
  })

  it('offers no checkout link while the cart is empty', () => {
    renderDrawer({ courts: [], items: [] })

    expect(screen.queryByRole('link', { name: /checkout/i })).not.toBeInTheDocument()
  })

  it('closes the drawer when the guest leaves for checkout', async () => {
    const user = userEvent.setup()
    const { onClose } = renderDrawer({ courts: [COURT] })

    await user.click(screen.getByRole('link', { name: /checkout/i }))

    expect(onClose).toHaveBeenCalled()
  })
})
