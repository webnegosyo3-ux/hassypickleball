import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { CourtBookingExperience } from './court-booking-experience'
import { CartProvider } from '@/features/cart/cart-provider'
import { resetCartSnapshot } from '@/features/cart/cart-store'
import type { AvailabilitySlot } from '@/lib/services/availability'

/**
 * The booking half of the court detail page: the slot picker and the "Your
 * booking" sidebar. They share one selection, so they are driven by a single
 * client island and tested together the way a customer meets them.
 */

const at = (utc: string): Date => new Date(`2026-08-04T${utc}:00Z`)

const slot = (utc: string, overrides: Partial<AvailabilitySlot> = {}): AvailabilitySlot => ({
  startsAt: at(utc),
  endsAt: at(utc),
  priceCents: 60000,
  isAvailable: true,
  ...overrides,
})

const ADDONS = [
  { id: 'p-1', name: 'Paddle rental', description: 'Graphite paddle', priceCents: 20000 },
  { id: 'p-2', name: 'Ball machine', description: 'Includes setup', priceCents: 60000 },
]

function renderExperience(overrides: Partial<Parameters<typeof CourtBookingExperience>[0]> = {}) {
  return render(
    <CartProvider>
      <CourtBookingExperience
        courtId="court-1"
        courtName="Court 1 — Center"
        slots={[slot('09:00'), slot('09:30'), slot('10:00', { isAvailable: false })]}
        addons={ADDONS}
        durationMinutes={60}
        timeZone="Asia/Manila"
        currency="PHP"
        cancellationWindowHours={12}
        minPlayers={2}
        maxPlayers={4}
        includedPlayers={4}
        extraPlayerFeeCents={0}
        {...overrides}
      />
    </CartProvider>,
  )
}

afterEach(() => {
  resetCartSnapshot()
})

describe('CourtBookingExperience', () => {
  it('lists every start time on the day, including the ones already taken', () => {
    // Arrange / Act
    renderExperience()

    // Assert — the design greys taken slots in place rather than hiding them.
    expect(screen.getByRole('button', { name: /5:00 PM/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /6:00 PM/ })).toHaveAccessibleName(/Booked/)
  })

  it('refuses to select a slot somebody else has already booked', async () => {
    // Arrange
    renderExperience()

    // Act / Assert
    expect(screen.getByRole('button', { name: /6:00 PM/ })).toBeDisabled()
  })

  it('asks for a start time before offering to add anything to the cart', () => {
    // Arrange / Act
    renderExperience()

    // Assert
    expect(screen.getByRole('button', { name: /select a start time/i })).toBeDisabled()
  })

  it('prices the session once a start time is picked', async () => {
    // Arrange
    const user = userEvent.setup()
    renderExperience()

    // Act
    await user.click(screen.getByRole('button', { name: /5:00 PM/ }))

    // Assert — the CTA carries the total the customer is about to be charged.
    const summary = screen.getByRole('region', { name: /your booking/i })
    expect(within(summary).getByText('Court 1 — Center · 1 hr')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to booking — ₱600' })).toBeEnabled()
  })

  it('adds a chosen add-on to the running total', async () => {
    // Arrange
    const user = userEvent.setup()
    renderExperience()
    await user.click(screen.getByRole('button', { name: /5:00 PM/ }))

    // Act
    await user.click(screen.getByRole('checkbox', { name: /paddle rental/i }))

    // Assert — 600 court + 200 paddle.
    expect(screen.getByRole('button', { name: 'Add to booking — ₱800' })).toBeInTheDocument()
  })

  it('takes a deselected add-on back off the total', async () => {
    // Arrange
    const user = userEvent.setup()
    renderExperience()
    await user.click(screen.getByRole('button', { name: /5:00 PM/ }))
    const paddle = screen.getByRole('checkbox', { name: /paddle rental/i })
    await user.click(paddle)

    // Act
    await user.click(paddle)

    // Assert
    expect(screen.getByRole('button', { name: 'Add to booking — ₱600' })).toBeInTheDocument()
  })

  it('switches between the timeline and the start-time grid', async () => {
    // Arrange
    const user = userEvent.setup()
    renderExperience()

    // Act
    await user.click(screen.getByRole('button', { name: /start times/i }))

    // Assert — the grid keeps the time and price but drops the per-row wording
    // the timeline carries. The legend still explains the colours, so this is
    // asserted on the row itself rather than on the page text.
    expect(screen.getByRole('button', { name: /5:00 PM/ })).not.toHaveAccessibleName(/Available/)
  })

  it('tells the customer how long they can still cancel for free', () => {
    // Arrange / Act
    renderExperience()

    // Assert
    expect(screen.getByText(/free cancellation up to 12 hours before/i)).toBeInTheDocument()
  })

  it('confirms the court reached the cart rather than leaving the click silent', async () => {
    // Arrange
    const user = userEvent.setup()
    renderExperience()
    await user.click(screen.getByRole('button', { name: /5:00 PM/ }))

    // Act
    await user.click(screen.getByRole('button', { name: /add to booking/i }))

    // Assert
    expect(screen.getByRole('status')).toHaveTextContent(/added to your booking/i)
  })

  it('says so plainly when the day has no start times at all', () => {
    // Arrange — a fully booked day, or one shorter than the session asked for.
    renderExperience({ slots: [] })

    // Assert
    expect(screen.getByText(/no start times on this day/i)).toBeInTheDocument()
  })

  it('still marks a taken slot as booked in the start-time grid', async () => {
    // Arrange
    const user = userEvent.setup()
    renderExperience()

    // Act
    await user.click(screen.getByRole('button', { name: /start times/i }))

    // Assert — the grid swaps the price for the reason it cannot be bought.
    expect(screen.getByRole('button', { name: /6:00 PM/ })).toHaveAccessibleName(/Booked/)
  })
})
