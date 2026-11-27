import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BookingStage, useBookingStage } from './booking-stage'

/**
 * The stage exists for one reason: the confirmation replaces the form, and the
 * court summary above it is rendered by the page, not by the form. These cases
 * pin both halves of that — the summary goes, the flow stays.
 */

function CommitButton() {
  const stage = useBookingStage()

  return (
    <button type="button" onClick={stage.markBooked}>
      Confirm booking
    </button>
  )
}

const SUMMARY = 'Court 1 · ₱350 per hour'

describe('BookingStage', () => {
  it('shows the court summary until a booking is confirmed', () => {
    // Act
    render(
      <BookingStage summary={<p>{SUMMARY}</p>}>
        <CommitButton />
      </BookingStage>,
    )

    // Assert
    expect(screen.getByText(SUMMARY)).toBeInTheDocument()
  })

  it('takes the summary away once the booking goes through', async () => {
    // Arrange
    const user = userEvent.setup()

    render(
      <BookingStage summary={<p>{SUMMARY}</p>}>
        <CommitButton />
      </BookingStage>,
    )

    // Act
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    // Assert — the pitch is gone, but the flow stays to hold the confirmation.
    expect(screen.queryByText(SUMMARY)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeInTheDocument()
  })

  it('reports nothing booked to a form rendered without a stage', async () => {
    // Arrange — a test or a preview may mount the form on its own.
    const user = userEvent.setup()

    render(<CommitButton />)

    // Act
    await user.click(screen.getByRole('button', { name: 'Confirm booking' }))

    // Assert — confirming is a no-op rather than a crash.
    expect(screen.getByRole('button', { name: 'Confirm booking' })).toBeInTheDocument()
  })
})
