import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingDetailPanel } from './booking-detail-panel'
import { toBookingDetailView, type ProofLookup } from '../view/bookings'
import { club, makeBooking } from '../../../../test/admin-fixtures'

/**
 * The panel is where a booking is actually managed: read the breakdown, look
 * at the proof, take the money, and move the booking on.
 */

const ok = <T,>(data: T) => ({ success: true as const, data })

function panelProps(detail = view()) {
  return {
    detail,
    currency: club.currency,
    onSetStatus: vi.fn().mockResolvedValue(ok({ id: detail.id })),
    onMarkPaid: vi.fn().mockResolvedValue(ok({ payment: {}, bookingStatus: 'confirmed' })),
    onRefund: vi.fn().mockResolvedValue(ok({ id: 'payment-0' })),
    onDone: vi.fn(),
  }
}

function view(spec: Parameters<typeof makeBooking>[0] | null = null, signed?: ProofLookup) {
  return toBookingDetailView(
    makeBooking(
      spec ?? {
        reference: 'PB-4821',
        status: 'awaiting_payment',
        segments: [
          {
            courtId: 'court-1',
            courtName: 'Harbor Court',
            from: '17:00',
            to: '18:00',
            priceCents: 60_000,
          },
        ],
      },
    ),
    club,
    signed,
  )
}

describe('BookingDetailPanel', () => {
  it('shows the players named during checkout', () => {
    const detail = view({
      players: ['Ana Cruz', 'Ben Uy'],
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
    })

    render(<BookingDetailPanel {...panelProps(detail)} />)

    const players = screen.getByRole('list', { name: 'Players' })
    expect(within(players).getByText('Ana Cruz')).toBeInTheDocument()
    expect(within(players).getByText('Ben Uy')).toBeInTheDocument()
  })

  it('names the booking it is showing and breaks the total down', () => {
    // Act
    render(<BookingDetailPanel {...panelProps()} />)

    // Assert
    expect(screen.getByRole('heading', { name: 'PB-4821' })).toBeInTheDocument()
    // The court line and the total are both ₱600 on a court-only booking.
    expect(screen.getByText('Court time')).toBeInTheDocument()
    expect(screen.getAllByText('₱600')).toHaveLength(2)
  })

  it('offers only the moves the booking can actually make', () => {
    // Act — awaiting payment can be confirmed or cancelled, never completed.
    render(<BookingDetailPanel {...panelProps()} />)

    // Assert
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel booking' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark completed' })).not.toBeInTheDocument()
  })

  it('offers nothing to do on a cancelled booking and says why', () => {
    // Arrange
    const cancelled = view({
      status: 'cancelled',
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
    })

    // Act
    render(<BookingDetailPanel {...panelProps(cancelled)} />)

    // Assert
    expect(screen.queryByRole('button', { name: /booking$/ })).not.toBeInTheDocument()
    expect(screen.getByText(/closed/i)).toBeInTheDocument()
  })

  it('confirms the booking through the action it was given', async () => {
    // Arrange
    const props = panelProps()
    render(<BookingDetailPanel {...props} />)

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    // Assert
    await waitFor(() =>
      expect(props.onSetStatus).toHaveBeenCalledWith({
        bookingId: props.detail.id,
        status: 'confirmed',
      }),
    )
  })

  it('surfaces a refused transition instead of pretending it worked', async () => {
    // Arrange
    const props = panelProps()
    props.onSetStatus.mockResolvedValue({
      success: false,
      error: 'That booking is no longer there',
    })
    render(<BookingDetailPanel {...props} />)

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('That booking is no longer there')
    expect(props.onDone).not.toHaveBeenCalled()
  })

  it('tells the screen to refresh once a transition lands', async () => {
    // Arrange
    const props = panelProps()
    render(<BookingDetailPanel {...props} />)

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Confirm booking' }))

    // Assert
    await waitFor(() => expect(props.onDone).toHaveBeenCalled())
  })

  it('records a payment for what is still owed, without staff retyping it', async () => {
    // Arrange
    const props = panelProps()
    render(<BookingDetailPanel {...props} />)

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Method'), 'cash')
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    // Assert — ₱600 outstanding, prefilled and sent in cents.
    await waitFor(() =>
      expect(props.onMarkPaid).toHaveBeenCalledWith({
        bookingId: props.detail.id,
        method: 'cash',
        amountCents: 60_000,
        externalReference: null,
      }),
    )
  })

  it('sends a typed reference along with a transfer, and nothing when it is blank', async () => {
    // Arrange
    const props = panelProps()
    render(<BookingDetailPanel {...props} />)

    // Act
    await userEvent.selectOptions(screen.getByLabelText('Method'), 'bank_transfer')
    await userEvent.type(screen.getByLabelText(/reference/i), 'BT-99120')
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    // Assert
    await waitFor(() =>
      expect(props.onMarkPaid).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'bank_transfer', externalReference: 'BT-99120' }),
      ),
    )
  })

  it('refuses to record a payment of nothing', async () => {
    // Arrange — a fully settled booking has no balance left to take.
    const settled = view({
      status: 'confirmed',
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00', priceCents: 60_000 }],
      payments: [{ method: 'cash', status: 'paid', amountCents: 60_000 }],
    })
    const props = panelProps(settled)
    render(<BookingDetailPanel {...props} />)

    // Act
    await userEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent(/more than nothing/i)
    expect(props.onMarkPaid).not.toHaveBeenCalled()
  })

  it('lists each recorded payment with its method, state, and amount', () => {
    // Arrange
    const paid = view({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00', priceCents: 60_000 }],
      payments: [{ method: 'gcash', status: 'paid', amountCents: 60_000 }],
    })

    // Act
    render(<BookingDetailPanel {...panelProps(paid)} />)

    // Assert
    const payments = screen.getByRole('list', { name: /payments/i })
    expect(within(payments).getByText(/GCash/)).toBeInTheDocument()
    expect(within(payments).getByText('Paid')).toBeInTheDocument()
  })

  it('links to the guest’s uploaded proof so the desk can check it before confirming', () => {
    // Arrange
    const withProof = view(
      {
        segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
        payments: [{ method: 'gcash', status: 'pending', proofUrl: 'PB-4821/proof.png' }],
      },
      { urls: { 'PB-4821/proof.png': 'https://cdn.example/signed?token=abc' }, failures: {} },
    )

    // Act
    render(<BookingDetailPanel {...panelProps(withProof)} />)

    // Assert — opens in a new tab, and never leaks the console URL as referrer.
    const link = screen.getByRole('link', { name: /proof/i })
    expect(link).toHaveAttribute('href', 'https://cdn.example/signed?token=abc')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  /**
   * The desk checks a photograph of a banking app against the amount on the
   * row. Sending staff to another tab for every payment meant the check was
   * usually skipped.
   */
  it('shows the proof itself, not only a link to it', () => {
    // Arrange
    const withProof = view(
      {
        segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
        payments: [{ method: 'gcash', status: 'pending', proofUrl: 'PB-4821/proof.png' }],
      },
      { urls: { 'PB-4821/proof.png': 'https://cdn.example/signed?token=abc' }, failures: {} },
    )

    // Act
    render(<BookingDetailPanel {...panelProps(withProof)} />)

    // Assert
    const link = screen.getByRole('link', { name: /proof/i })
    expect(link.querySelector('img')).toHaveAttribute('src', 'https://cdn.example/signed?token=abc')
  })

  it('says a proof exists when its link could not be signed', () => {
    // Arrange — a proof on file, but the signing step produced nothing.
    const unreadable = view({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      payments: [{ method: 'gcash', status: 'pending', proofUrl: 'PB-4821/proof.png' }],
    })

    // Act
    render(<BookingDetailPanel {...panelProps(unreadable)} />)

    // Assert — silence here would read as “the guest attached nothing”.
    expect(screen.getByText(/could not be opened/i)).toBeInTheDocument()
  })

  it('flags money still owed with no proof to check', () => {
    // Arrange
    const waiting = view({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      payments: [{ method: 'bank_transfer', status: 'pending' }],
    })

    // Act
    render(<BookingDetailPanel {...panelProps(waiting)} />)

    // Assert
    expect(screen.getByText(/no proof uploaded yet/i)).toBeInTheDocument()
  })

  it('shows no proof link for a payment that has none', () => {
    // Arrange
    const cash = view({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      payments: [{ method: 'cash', status: 'paid' }],
    })

    // Act
    render(<BookingDetailPanel {...panelProps(cash)} />)

    // Assert
    expect(screen.queryByRole('link', { name: /proof/i })).not.toBeInTheDocument()
  })

  it('refunds a settled payment through the action it was given', async () => {
    // Arrange
    const paid = view({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00', priceCents: 60_000 }],
      payments: [{ method: 'card', status: 'paid', amountCents: 60_000 }],
    })
    const props = panelProps(paid)
    render(<BookingDetailPanel {...props} />)

    // Act
    await userEvent.click(screen.getByRole('button', { name: /refund/i }))

    // Assert
    await waitFor(() =>
      expect(props.onRefund).toHaveBeenCalledWith({ paymentId: paid.payments[0].id }),
    )
  })

  it('offers no refund on a payment that never settled', () => {
    // Arrange
    const pending = view({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      payments: [{ method: 'bank_transfer', status: 'pending' }],
    })

    // Act
    render(<BookingDetailPanel {...panelProps(pending)} />)

    // Assert
    expect(screen.queryByRole('button', { name: /refund/i })).not.toBeInTheDocument()
  })

  it('shows the booking note, which is where desk instructions live', () => {
    // Arrange
    const noted = view({
      notes: 'Member — approved for desk payment.',
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
    })

    // Act
    render(<BookingDetailPanel {...panelProps(noted)} />)

    // Assert
    expect(screen.getByText('Member — approved for desk payment.')).toBeInTheDocument()
  })

  it('carries the page’s heading when it is the page', () => {
    // Act
    render(<BookingDetailPanel {...panelProps()} headingLevel="h1" />)

    // Assert — one h1 per page: the booking's own reference.
    expect(screen.getByRole('heading', { level: 1, name: 'PB-4821' })).toBeInTheDocument()
  })
})

/**
 * The panel takes the whole screen on a phone, where the desk records a
 * payment one-handed at the counter.
 */
describe('BookingDetailPanel on a phone', () => {
  it('gives the payment fields a full touch target', () => {
    // Arrange & Act
    render(<BookingDetailPanel {...panelProps()} />)

    // Assert — 44px is the smallest target a thumb hits reliably.
    expect(screen.getByLabelText('Method').className).toContain('h-11')
    expect(screen.getByLabelText(/Amount/).className).toContain('h-11')
  })
})
