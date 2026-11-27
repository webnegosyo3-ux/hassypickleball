import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { QrCodeDialog } from './qr-code-dialog'

/**
 * A QR a phone cannot read is the same as no QR at all, so the button's job is
 * to put the uploaded image on screen at full width — and then get out of the
 * guest's way without losing their place in the form.
 */

const LABEL = 'GCash'
const IMAGE_URL = 'https://example.supabase.co/storage/v1/object/public/payment-qr/gcash.png'

function renderDialog() {
  render(<QrCodeDialog label={LABEL} imageUrl={IMAGE_URL} />)

  return { trigger: screen.getByRole('button', { name: 'View QR code' }) }
}

describe('QrCodeDialog', () => {
  it('keeps the code closed until the guest asks for it', () => {
    // Act
    renderDialog()

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('opens the uploaded code in a dialog named after the method', async () => {
    // Arrange
    const user = userEvent.setup()
    const { trigger } = renderDialog()

    // Act
    await user.click(trigger)

    // Assert
    const dialog = screen.getByRole('dialog')

    expect(dialog).toHaveAccessibleName(`Scan to pay with ${LABEL}`)
    expect(within(dialog).getByRole('img', { name: `${LABEL} QR code` })).toHaveAttribute(
      'src',
      IMAGE_URL,
    )
  })

  it('moves focus into the dialog so a keyboard user is not left behind it', async () => {
    // Arrange
    const user = userEvent.setup()
    const { trigger } = renderDialog()

    // Act
    await user.click(trigger)

    // Assert
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()
  })

  it('closes on the Close button and hands focus back to the trigger', async () => {
    // Arrange — the guest was mid-form, so the trigger is where they belong.
    const user = userEvent.setup()
    const { trigger } = renderDialog()

    await user.click(trigger)

    // Act
    await user.click(screen.getByRole('button', { name: 'Close' }))

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes on Escape', async () => {
    // Arrange
    const user = userEvent.setup()
    const { trigger } = renderDialog()

    await user.click(trigger)

    // Act
    await user.keyboard('{Escape}')

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes when the backdrop is tapped', async () => {
    // Arrange
    const user = userEvent.setup()
    const { trigger } = renderDialog()

    await user.click(trigger)

    // Act — on a phone, tapping outside is the first thing a guest tries.
    await user.click(screen.getByRole('button', { name: 'Close QR code' }))

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
