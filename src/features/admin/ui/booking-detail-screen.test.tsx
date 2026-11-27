import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingDetailScreen } from './booking-detail-screen'
import { toBookingDetailView } from '../view/bookings'
import { club, makeBooking } from '../../../../test/admin-fixtures'

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
}))

/**
 * A booking manages itself on its own page now. The screen's job is to give the
 * record the width, keep a way back to the ledger, and hold the one destructive
 * action apart from the buttons the desk presses every day.
 */

const ok = <T,>(data: T) => ({ success: true as const, data })

const detail = toBookingDetailView(
  makeBooking({
    reference: 'PB-4821',
    status: 'awaiting_payment',
    segments: [{ courtId: 'court-1', courtName: 'Harbor Court', from: '17:00', to: '18:00' }],
    payments: [{ method: 'gcash', status: 'pending' }],
  }),
  club,
)

function screenProps() {
  return {
    detail,
    currency: club.currency,
    onSetStatus: vi.fn().mockResolvedValue(ok({ id: detail.id })),
    onMarkPaid: vi.fn().mockResolvedValue(ok({})),
    onRefund: vi.fn().mockResolvedValue(ok({})),
    onDelete: vi.fn().mockResolvedValue(ok({ bookingId: detail.id })),
  }
}

describe('BookingDetailScreen', () => {
  it('names the booking as the page it is', () => {
    // Act
    render(<BookingDetailScreen {...screenProps()} />)

    // Assert — the reference is the page's own heading, not a card title.
    expect(screen.getByRole('heading', { level: 1, name: 'PB-4821' })).toBeInTheDocument()
  })

  it('offers the way back to the ledger', () => {
    // Act
    render(<BookingDetailScreen {...screenProps()} />)

    // Assert
    expect(screen.getByRole('link', { name: /all bookings/i })).toHaveAttribute(
      'href',
      '/admin/bookings',
    )
  })

  it('keeps the moves the desk makes daily on the page', () => {
    // Act
    render(<BookingDetailScreen {...screenProps()} />)

    // Assert
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeInTheDocument()
  })

  it('says what a deletion takes with it, by reference', () => {
    // Act
    render(<BookingDetailScreen {...screenProps()} />)

    // Assert
    const card = screen.getByRole('region', { name: /delete booking/i })
    expect(card).toHaveTextContent('PB-4821')
    expect(card).toHaveTextContent(/cannot be undone/i)
  })

  it('asks before deleting, and sends nothing on a first press', async () => {
    // Arrange
    const props = screenProps()
    render(<BookingDetailScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete PB-4821' }))

    // Assert
    expect(screen.getByRole('dialog', { name: 'Delete PB-4821?' })).toBeInTheDocument()
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it('leaves for the ledger once the booking is gone', async () => {
    // Arrange
    const props = screenProps()
    render(<BookingDetailScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete PB-4821' }))
    await user.click(screen.getByRole('button', { name: 'Delete booking' }))

    // Assert — the page being left no longer exists, so it is replaced rather
    // than pushed: Back must not return to a deleted booking.
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith({ bookingId: detail.id }))
    expect(replace).toHaveBeenCalledWith('/admin/bookings')
  })
})
