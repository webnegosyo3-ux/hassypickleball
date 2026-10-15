import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckoutExperience } from './checkout-experience'
import { CartProvider } from '@/features/cart/cart-provider'
import { resetCartSnapshot, writeStoredCart } from '@/features/cart/cart-store'
import type { Cart, CartCourtLine, CartItemLine } from '@/lib/domain/cart'
import type { CheckoutPaymentMethod } from '../view/checkout-view'

/**
 * Checkout is the one screen where a guest hands over contact details and money,
 * so it is tested the way a guest uses it: fill the form, read the instructions
 * for the method you picked, attach the screenshot, and end up looking at a
 * reservation number.
 */

const COURT: CartCourtLine = {
  courtId: 'court-1',
  courtName: 'Court 3',
  startsAt: new Date('2026-08-08T06:00:00.000Z'),
  endsAt: new Date('2026-08-08T07:00:00.000Z'),
  priceCents: 60000,
  timeZone: 'Asia/Manila',
  currency: 'PHP',
  minPlayers: 2,
  maxPlayers: 4,
  includedPlayers: 4,
  extraPlayerFeeCents: 0,
} as CartCourtLine

const ITEM: CartItemLine = {
  productId: 'gatorade',
  name: 'Gatorade',
  unitPriceCents: 9000,
  quantity: 2,
  currency: 'PHP',
}

const GCASH: CheckoutPaymentMethod = {
  id: 'method-gcash',
  label: 'GCash',
  accountName: 'Baseline Pickleball Club',
  accountNumber: '0917 123 4567',
  instructions: 'Send the exact total, then upload the receipt screenshot.',
  qrImageUrl: null,
  requiresProof: true,
}

const CASH: CheckoutPaymentMethod = {
  id: 'method-cash',
  label: 'Pay at the desk',
  accountName: null,
  accountNumber: null,
  instructions: 'Settle in cash when you arrive. Please come 10 minutes early.',
  qrImageUrl: null,
  requiresProof: false,
}

const submit = vi.fn()

function renderCheckout(cart: Partial<Cart> = { courts: [COURT], items: [ITEM] }) {
  writeStoredCart({ courts: [], items: [], ...cart })
  resetCartSnapshot()

  render(
    <CartProvider>
      <CheckoutExperience
        clubId="00000000-0000-4000-8000-000000000001"
        paymentMethods={[GCASH, CASH]}
        currency="PHP"
        onSubmit={submit}
      />
    </CartProvider>,
  )
}

function screenshotFile(name = 'receipt.png', type = 'image/png') {
  return new File(['x'], name, { type })
}

async function fillContactDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/full name/i), 'Ana Cruz')
  await user.type(screen.getByLabelText(/email/i), 'ana@example.com')
  await user.type(screen.getByLabelText(/phone/i), '0917 123 4567')
}

beforeEach(() => {
  vi.clearAllMocks()
  submit.mockResolvedValue({
    success: true,
    data: {
      reference: 'PB-4G6JVH',
      status: 'awaiting_payment',
      totalCents: 78000,
      paymentMethodLabel: 'GCash',
      proofAttached: true,
    },
  })
})

afterEach(() => {
  window.localStorage.clear()
  resetCartSnapshot()
})

describe('CheckoutExperience', () => {
  it('shows what is being booked and what it costs', () => {
    renderCheckout()

    const summary = screen.getByRole('region', { name: /order summary/i })

    expect(within(summary).getByText('Court 3')).toBeInTheDocument()
    expect(within(summary).getByText('Gatorade')).toBeInTheDocument()
    expect(within(summary).getByTestId('checkout-total')).toHaveTextContent('780')
  })

  it('asks for a name, an email, and a phone number', () => {
    renderCheckout()

    expect(screen.getByLabelText(/full name/i)).toBeRequired()
    expect(screen.getByLabelText(/email/i)).toBeRequired()
    expect(screen.getByLabelText(/phone/i)).toBeRequired()
  })

  it('lets the guest add players up to the court maximum and sends their names', async () => {
    const user = userEvent.setup()
    renderCheckout()

    expect(screen.getByText(/maximum 4 players/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /add player/i }))
    await user.type(screen.getByLabelText(/player 1 name/i), 'Ana Cruz')
    await user.click(screen.getByRole('button', { name: /add player/i }))
    await user.type(screen.getByLabelText(/player 2 name/i), 'Ben Uy')
    await user.click(screen.getByRole('button', { name: /add player/i }))
    await user.type(screen.getByLabelText(/player 3 name/i), 'Cara Lim')
    await user.click(screen.getByRole('button', { name: /add player/i }))
    await user.type(screen.getByLabelText(/player 4 name/i), 'Dee Ng')

    expect(screen.queryByRole('button', { name: /add player/i })).not.toBeInTheDocument()

    await fillContactDetails(user)
    await user.click(screen.getByRole('radio', { name: /pay at the desk/i }))
    await user.click(screen.getByRole('button', { name: /confirm|place|pay/i }))

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const form = submit.mock.calls[0]?.[0] as FormData
    expect(JSON.parse(String(form.get('order'))).players).toEqual([
      'Ana Cruz',
      'Ben Uy',
      'Cara Lim',
      'Dee Ng',
    ])
  })

  it('shows the account details for the payment method the guest picks', async () => {
    const user = userEvent.setup()
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /gcash/i }))

    expect(screen.getByText('0917 123 4567')).toBeInTheDocument()
    expect(screen.getByText(/send the exact total/i)).toBeInTheDocument()
  })

  it('shows only the instructions for the selected method, not every method at once', async () => {
    const user = userEvent.setup()
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /pay at the desk/i }))

    expect(screen.getByText(/settle in cash/i)).toBeInTheDocument()
    expect(screen.queryByText(/send the exact total/i)).not.toBeInTheDocument()
  })

  it('asks for a payment screenshot only when the chosen method needs one', async () => {
    const user = userEvent.setup()
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /gcash/i }))
    expect(screen.getByLabelText(/screenshot/i)).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /pay at the desk/i }))
    expect(screen.queryByLabelText(/screenshot/i)).not.toBeInTheDocument()
  })

  it('rejects a file that is not an image before anything is sent', async () => {
    // applyAccept: false is the point of the test. The `accept` attribute is a
    // hint the OS file dialog offers to respect, and a guest who switches it to
    // "All files" gets past it — so the check has to be in our code too.
    const user = userEvent.setup({ applyAccept: false })
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /gcash/i }))
    await fillContactDetails(user)
    await user.upload(
      screen.getByLabelText(/screenshot/i),
      new File(['x'], 'statement.pdf', { type: 'application/pdf' }),
    )
    await user.click(screen.getByRole('button', { name: /confirm|place|pay/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/image/i)
    expect(submit).not.toHaveBeenCalled()
  })

  it('will not submit a proof-required method without a screenshot', async () => {
    const user = userEvent.setup()
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /gcash/i }))
    await fillContactDetails(user)
    await user.click(screen.getByRole('button', { name: /confirm|place|pay/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/screenshot/i)
    expect(submit).not.toHaveBeenCalled()
  })

  it('sends the cart, the contact details, and the file as one submission', async () => {
    const user = userEvent.setup()
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /gcash/i }))
    await fillContactDetails(user)
    await user.upload(screen.getByLabelText(/screenshot/i), screenshotFile())
    await user.click(screen.getByRole('button', { name: /confirm|place|pay/i }))

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))

    const form = submit.mock.calls[0]?.[0] as FormData
    const order = JSON.parse(String(form.get('order')))

    expect(order).toMatchObject({
      contactName: 'Ana Cruz',
      contactEmail: 'ana@example.com',
      contactPhone: '0917 123 4567',
      paymentMethodId: 'method-gcash',
    })
    expect(order.courts).toHaveLength(1)
    expect(order.items).toEqual([{ productId: 'gatorade', quantity: 2 }])
    expect(form.get('proof')).toBeInstanceOf(File)
  })

  it('shows the reservation number on the thank-you screen', async () => {
    const user = userEvent.setup()
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /gcash/i }))
    await fillContactDetails(user)
    await user.upload(screen.getByLabelText(/screenshot/i), screenshotFile())
    await user.click(screen.getByRole('button', { name: /confirm|place|pay/i }))

    expect(await screen.findByText('PB-4G6JVH')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /thank you/i })).toBeInTheDocument()
  })

  it('empties the cart once the booking exists, so a refresh cannot rebook it', async () => {
    const user = userEvent.setup()
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /gcash/i }))
    await fillContactDetails(user)
    await user.upload(screen.getByLabelText(/screenshot/i), screenshotFile())
    await user.click(screen.getByRole('button', { name: /confirm|place|pay/i }))

    await screen.findByText('PB-4G6JVH')

    expect(JSON.parse(window.localStorage.getItem('pickleball.cart.v1') ?? '{}')).toMatchObject({
      courts: [],
      items: [],
    })
  })

  it('tells the guest to send the screenshot to the desk when the upload did not attach', async () => {
    submit.mockResolvedValue({
      success: true,
      data: {
        reference: 'PB-4G6JVH',
        status: 'awaiting_payment',
        totalCents: 78000,
        paymentMethodLabel: 'GCash',
        proofAttached: false,
      },
    })

    const user = userEvent.setup()
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /gcash/i }))
    await fillContactDetails(user)
    await user.upload(screen.getByLabelText(/screenshot/i), screenshotFile())
    await user.click(screen.getByRole('button', { name: /confirm|place|pay/i }))

    expect(await screen.findByText('PB-4G6JVH')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/screenshot/i)
  })

  it('keeps the cart and shows the reason when the booking is refused', async () => {
    submit.mockResolvedValue({
      success: false,
      error: 'Someone just took that slot. Please pick another time.',
      code: 'SLOT_TAKEN',
    })

    const user = userEvent.setup()
    renderCheckout()

    await user.click(screen.getByRole('radio', { name: /gcash/i }))
    await fillContactDetails(user)
    await user.upload(screen.getByLabelText(/screenshot/i), screenshotFile())
    await user.click(screen.getByRole('button', { name: /confirm|place|pay/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/took that slot/i)
    expect(screen.queryByRole('heading', { name: /thank you/i })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: /order summary/i })).toBeInTheDocument()
  })

  it('sends an empty cart nowhere', () => {
    renderCheckout({ courts: [], items: [] })

    expect(screen.getByText(/nothing to check out|booking is empty/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /confirm|place|pay/i })).not.toBeInTheDocument()
  })
})
