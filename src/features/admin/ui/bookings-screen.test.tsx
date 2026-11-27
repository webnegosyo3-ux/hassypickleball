import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BookingsScreen } from './bookings-screen'
import { toBookingRows } from '../view/bookings'
import { club, makeBooking } from '../../../../test/admin-fixtures'
import {
  expectCellsLabelledByColumn,
  expectExplicitTableRoles,
  expectNoPhoneMinimumWidth,
} from '../../../../test/responsive-table'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

/**
 * One ledger for every booking. This screen replaced the separate Orders
 * ledger: the same rows, seen through both the session and the money at once.
 *
 * The booking itself lives on its own page now, so every row test here is about
 * reading the list and getting to the right record from it.
 */

const bookings = [
  makeBooking({
    id: 'b1',
    reference: 'PB-4821',
    contactName: 'Maya Halvorsen',
    status: 'confirmed',
    segments: [{ courtId: 'court-1', courtName: 'Harbor Court', from: '17:00', to: '18:30' }],
    items: [{ name: 'Paddle rental', quantity: 2 }],
    payments: [{ method: 'gcash', status: 'paid' }],
  }),
  makeBooking({
    id: 'b2',
    reference: 'PB-4820',
    contactName: 'Jun Park',
    status: 'awaiting_payment',
    segments: [{ courtId: 'court-1', courtName: 'Harbor Court', from: '20:00', to: '21:00' }],
    payments: [{ method: 'bank_transfer', status: 'pending' }],
  }),
]

const rows = toBookingRows(bookings, club)

/**
 * A booking with a guest's transfer screenshot on it, beside one without, so a
 * test can tell the row that offers its proof from the row that has none.
 */
const proofRows = toBookingRows(
  [
    bookings[0],
    makeBooking({
      id: 'b3',
      reference: 'PB-4819',
      status: 'awaiting_payment',
      segments: [{ courtId: 'court-1', courtName: 'Harbor Court', from: '19:00', to: '20:00' }],
      payments: [
        { method: 'gcash', status: 'pending', amountCents: 120000, proofUrl: 'PB-4819/proof.png' },
      ],
    }),
  ],
  club,
)

const PROOF_LINE = {
  id: 'payment-0',
  method: 'GCash',
  status: 'awaiting' as const,
  amount: '₱1,200.00',
  hasProof: true,
  proofHref: 'https://storage.example/proofs/signed?token=abc',
  proofError: null,
}

function screenProps() {
  return {
    rows,
    onDelete: vi.fn().mockResolvedValue({ success: true, data: {} }),
    onLoadProof: vi.fn().mockResolvedValue({ success: true, data: [] }),
  }
}

function proofProps() {
  return {
    rows: proofRows,
    onDelete: vi.fn().mockResolvedValue({ success: true, data: {} }),
    onLoadProof: vi.fn().mockResolvedValue({ success: true, data: [PROOF_LINE] }),
  }
}

describe('BookingsScreen', () => {
  it('lists every booking as a row in a real table', () => {
    // Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert — a table, not a grid of divs, so it can be read by column.
    const table = screen.getByRole('table', { name: 'Bookings' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)
  })

  it('shows the reference, customer, court, time, and extras for each booking', () => {
    // Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert
    const table = screen.getByRole('table', { name: 'Bookings' })
    expect(within(table).getByText('PB-4821')).toBeInTheDocument()
    expect(within(table).getByText('Maya Halvorsen')).toBeInTheDocument()
    expect(within(table).getByText(/5:00 PM · 1 hr 30 min/)).toBeInTheDocument()
    expect(within(table).getByText('Paddle rental ×2')).toBeInTheDocument()
  })

  it('states each booking’s status in words, not only in colour', () => {
    // Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert
    const table = screen.getByRole('table', { name: 'Bookings' })
    expect(within(table).getByText('Awaiting payment')).toBeInTheDocument()
    expect(within(table).getByText('Confirmed')).toBeInTheDocument()
  })

  /**
   * The reason the two ledgers merged: one row now carries both facts, so the
   * desk sees a confirmed booking whose transfer has not cleared.
   */
  it('shows how each booking was paid and whether the money has landed', () => {
    // Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert
    const table = screen.getByRole('table', { name: 'Bookings' })
    expect(within(table).getByText('GCash')).toBeInTheDocument()
    expect(within(table).getByText('Bank transfer')).toBeInTheDocument()
    expect(within(table).getByText('Paid')).toBeInTheDocument()
    expect(within(table).getByText('Awaiting')).toBeInTheDocument()
  })

  /**
   * Reconciling a transfer starts here: the row says whether there is a proof
   * worth opening, instead of making the desk click into every booking to find
   * out that there is nothing to see.
   */
  it('says which bookings have a proof of payment attached', () => {
    // Act
    render(<BookingsScreen {...proofProps()} />)

    // Assert — the one row with a screenshot offers it; the other does not.
    expect(screen.getAllByRole('button', { name: /show payment proof/i })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Show payment proof PB-4819' })).toBeInTheDocument()
  })

  it('links each row to the booking’s own page, so it can be sent to a colleague', () => {
    // Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert
    expect(screen.getByRole('link', { name: 'PB-4820' })).toHaveAttribute(
      'href',
      '/admin/bookings/b2',
    )
  })

  /**
   * The table used to sit in two thirds of the screen with the booking managed
   * beside it, so the money column's heading sat left over right-aligned pesos.
   */
  it('sets each heading over the values it belongs to', () => {
    // Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert
    const headers = screen.getAllByRole('columnheader')
    const headingOf = (name: string): HTMLElement =>
      headers.find((header) => header.textContent === name) as HTMLElement

    expect(headingOf('Total').className).toContain('text-right')
    expect(headingOf('Reference').className).toContain('text-left')
  })

  it('says so plainly when there is nothing booked', () => {
    // Act
    render(<BookingsScreen rows={[]} onDelete={vi.fn()} onLoadProof={vi.fn()} />)

    // Assert
    expect(screen.getByText('No bookings in this window yet.')).toBeInTheDocument()
  })

  it('counts what the desk is chasing in the subtitle', () => {
    // Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert
    expect(screen.getByText(/1 awaiting payment/)).toBeInTheDocument()
  })
})

/**
 * Thirty days of bookings is an unscannable column of cards on a phone, so the
 * desk says what it is after rather than scrolling for it.
 */
describe('BookingsScreen searching', () => {
  it('narrows the ledger to the customer the desk typed', async () => {
    // Arrange
    render(<BookingsScreen {...screenProps()} />)
    const user = userEvent.setup()

    // Act
    await user.type(screen.getByRole('searchbox', { name: /search bookings/i }), 'Jun')

    // Assert
    const table = screen.getByRole('table', { name: 'Bookings' })
    expect(within(table).getByText('PB-4820')).toBeInTheDocument()
    expect(within(table).queryByText('PB-4821')).not.toBeInTheDocument()
  })

  it('says nothing matched rather than showing an empty ledger', async () => {
    // Arrange
    render(<BookingsScreen {...screenProps()} />)
    const user = userEvent.setup()

    // Act
    await user.type(screen.getByRole('searchbox', { name: /search bookings/i }), 'Nobody')

    // Assert
    expect(screen.getByText('No bookings match this search.')).toBeInTheDocument()
  })

  it('counts what sits behind each status tab', () => {
    // Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert
    const tabs = screen.getByRole('group', { name: /filter bookings/i })
    expect(within(tabs).getByRole('button', { name: /^all 2$/i })).toBeInTheDocument()
    expect(within(tabs).getByRole('button', { name: /^awaiting payment 1$/i })).toBeInTheDocument()
  })

  it('narrows the ledger to the money it still has to chase', async () => {
    // Arrange
    render(<BookingsScreen {...screenProps()} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: /^awaiting payment 1$/i }))

    // Assert
    const table = screen.getByRole('table', { name: 'Bookings' })
    expect(within(table).getByText('PB-4820')).toBeInTheDocument()
    expect(within(table).queryByText('PB-4821')).not.toBeInTheDocument()
  })

  it('marks the tab in force, so the desk knows what it is looking at', async () => {
    // Arrange
    render(<BookingsScreen {...screenProps()} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: /^confirmed 1$/i }))

    // Assert
    expect(screen.getByRole('button', { name: /^confirmed 1$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /^all 2$/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

/**
 * Checking a transfer used to mean leaving the ledger for the booking's page.
 * The proof now opens where the row is, and closes back onto it.
 */
describe('BookingsScreen payment proof', () => {
  it('opens the uploaded proof without leaving the ledger', async () => {
    // Arrange
    const props = proofProps()
    render(<BookingsScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Show payment proof PB-4819' }))

    // Assert
    const dialog = await screen.findByRole('dialog', { name: /payment proof · PB-4819/i })
    expect(props.onLoadProof).toHaveBeenCalledWith({ bookingId: 'b3' })
    expect(
      await within(dialog).findByRole('img', { name: /proof uploaded for PB-4819/i }),
    ).toBeVisible()
    expect(within(dialog).getByRole('link', { name: /open full size/i })).toHaveAttribute(
      'href',
      PROOF_LINE.proofHref,
    )
  })

  it('names the money the screenshot is meant to settle', async () => {
    // Arrange
    render(<BookingsScreen {...proofProps()} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Show payment proof PB-4819' }))

    // Assert
    const dialog = await screen.findByRole('dialog', { name: /payment proof · PB-4819/i })
    expect(await within(dialog).findByText(/GCash · ₱1,200\.00/)).toBeInTheDocument()
  })

  it('does not ask for anything until the desk presses the button', () => {
    // Arrange & Act
    const props = proofProps()
    render(<BookingsScreen {...props} />)

    // Assert — no signed links are fetched while the ledger renders.
    expect(props.onLoadProof).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says so when the guest never sent one', async () => {
    // Arrange
    const props = {
      ...proofProps(),
      onLoadProof: vi.fn().mockResolvedValue({ success: true, data: [] }),
    }
    render(<BookingsScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Show payment proof PB-4819' }))

    // Assert
    expect(await screen.findByText('No proof was uploaded for this booking.')).toBeInTheDocument()
  })

  it('says a proof could not be opened rather than showing an empty frame', async () => {
    // Arrange — the server said why, and that is what the desk needs to see.
    const props = {
      ...proofProps(),
      onLoadProof: vi.fn().mockResolvedValue({
        success: true,
        data: [
          {
            ...PROOF_LINE,
            proofHref: null,
            proofError: 'SUPABASE_SERVICE_ROLE_KEY is not set on this server.',
          },
        ],
      }),
    }
    render(<BookingsScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Show payment proof PB-4819' }))

    // Assert
    expect(await screen.findByText(/SUPABASE_SERVICE_ROLE_KEY is not set/i)).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('surfaces a refused lookup instead of a dialog that looks loaded', async () => {
    // Arrange
    const props = {
      ...proofProps(),
      onLoadProof: vi.fn().mockResolvedValue({
        success: false,
        error: 'That booking is no longer there',
      }),
    }
    render(<BookingsScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Show payment proof PB-4819' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('That booking is no longer there')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

/**
 * Deleting is the one irreversible thing on this screen, so it is asked for by
 * name and nothing is sent until the desk says so twice.
 */
describe('BookingsScreen deleting', () => {
  it('asks which booking is going before anything is sent', async () => {
    // Arrange
    const props = screenProps()
    render(<BookingsScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete PB-4820' }))

    // Assert
    expect(screen.getByRole('dialog', { name: 'Delete PB-4820?' })).toBeInTheDocument()
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it('keeps the booking when the desk changes its mind', async () => {
    // Arrange
    const props = screenProps()
    render(<BookingsScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete PB-4820' }))
    await user.click(screen.getByRole('button', { name: 'Keep it' }))

    // Assert
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(props.onDelete).not.toHaveBeenCalled()
  })

  it('deletes the booking the desk confirmed', async () => {
    // Arrange
    const props = screenProps()
    render(<BookingsScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete PB-4820' }))
    await user.click(screen.getByRole('button', { name: 'Delete booking' }))

    // Assert
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith({ bookingId: 'b2' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('surfaces a refused deletion instead of closing the dialog as if it worked', async () => {
    // Arrange
    const props = screenProps()
    props.onDelete.mockResolvedValue({
      success: false,
      error: 'That booking is no longer there',
    })
    render(<BookingsScreen {...props} />)
    const user = userEvent.setup()

    // Act
    await user.click(screen.getByRole('button', { name: 'Delete PB-4820' }))
    await user.click(screen.getByRole('button', { name: 'Delete booking' }))

    // Assert
    expect(await screen.findByRole('alert')).toHaveTextContent('That booking is no longer there')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('BookingsScreen on a phone', () => {
  it('stacks each row into a labelled card instead of scrolling sideways', () => {
    // Arrange & Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert — the header row is off-screen in the stacked layout, so every
    // cell names its own column and the table keeps its roles.
    const table = screen.getByRole('table', { name: 'Bookings' })
    expectCellsLabelledByColumn(table)
    expectExplicitTableRoles(table)
    expectNoPhoneMinimumWidth(table)
  })

  /**
   * Nine columns printed as nine label-and-value lines is a wall of grey text.
   * The card is led by the two things staff scan for — which booking, and how
   * much — with the badges beside them.
   */
  it('leads each card with the reference and the amount owed', () => {
    // Arrange & Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert
    const table = screen.getByRole('table', { name: 'Bookings' })
    const [row] = within(table).getAllByRole('row').slice(1)
    const roleOf = (label: string): string | null =>
      within(row)
        .getAllByRole('cell')
        .find((cell) => cell.getAttribute('data-label') === label)
        ?.getAttribute('data-mobile') ?? null

    expect(roleOf('Reference')).toBe('title')
    expect(roleOf('Total')).toBe('trailing')
    expect(roleOf('Customer')).toBe('lead')
    expect(roleOf('Status')).toBe('badge')
    expect(roleOf('Payment')).toBe('badge')
    expect(roleOf('Court')).toBe('inline')
  })

  it('gives every card a tappable way into the booking, not just the reference', () => {
    // Arrange & Act
    render(<BookingsScreen {...screenProps()} />)

    // Assert
    expect(screen.getByRole('link', { name: /manage PB-4820/i })).toHaveAttribute(
      'href',
      '/admin/bookings/b2',
    )
  })
})
