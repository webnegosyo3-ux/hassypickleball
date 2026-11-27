import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CourtBookingForm } from './court-booking-form'
import { BookingStage } from './booking-stage'
import { serialiseSlot, type SerialisedSlot } from '../view/availability-payload'
import { err, ok, type Result } from '@/lib/api/result'
import type { CheckoutResult } from '@/features/checkout/server/submit-checkout'
import type { CheckoutPaymentMethod } from '@/features/checkout/view/payment-method'

/**
 * The court page's booking form.
 *
 * These tests are about the promise the form makes to a customer: a start time
 * is only offered once it is known to be free, nothing is sent until a slot and
 * a payment method are chosen, and what is sent names the slot rather than its
 * price.
 */

const DAY = '2026-09-27'

function slotAt(hourUtc: number, overrides: Partial<SerialisedSlot> = {}): SerialisedSlot {
  return {
    ...serialiseSlot({
      startsAt: new Date(`2026-09-27T0${hourUtc}:00:00.000Z`),
      endsAt: new Date(`2026-09-27T0${hourUtc + 1}:00:00.000Z`),
      priceCents: 90_000,
      isAvailable: true,
      isBlocked: false,
      isPast: false,
    }),
    ...overrides,
  }
}

const SLOTS: readonly SerialisedSlot[] = [slotAt(2), slotAt(3), slotAt(4, { isAvailable: false })]

const GCASH: CheckoutPaymentMethod = {
  id: 'gcash',
  label: 'GCash',
  accountName: 'Hassy Pickleball',
  accountNumber: '0917 000 0000',
  instructions: null,
  qrImageUrl: null,
  // Settles at the desk, so no screenshot is required.
  requiresProof: false,
}

const ADDON = {
  id: 'paddle-rental',
  name: 'Paddle rental',
  description: 'Two paddles and a ball',
  priceCents: 15_000,
}

const PITCH = 'Court 1 · up to 4 players, ₱350 per hour'

function renderForm(
  overrides: {
    readonly onSubmit?: (form: FormData) => Promise<Result<CheckoutResult>>
    /** Mount it the way the court page does, with the court card above it. */
    readonly inStage?: boolean
  } = {},
) {
  const onSubmit = vi.fn(async (_form: FormData): Promise<Result<CheckoutResult>> =>
    ok({
      reference: 'HP-1234',
      status: 'awaiting_payment',
      totalCents: 90_000,
      paymentMethodLabel: 'GCash',
      proofAttached: true,
    }),
  )

  const form = (
    <CourtBookingForm
      clubId="club-1"
      courtId="court-1"
      courtName="Court 1"
      currency="PHP"
      timeZone="Asia/Manila"
      cancellationWindowHours={12}
      capacity={{
        minPlayers: 2,
        includedPlayers: 4,
        maxPlayers: 8,
        extraPlayerFeeCents: 5_000,
      }}
      durations={[
        { minutes: 30, label: '30 min' },
        { minutes: 60, label: '1 hour' },
      ]}
      today={DAY}
      initialDay={DAY}
      initialDuration={60}
      initialSlots={SLOTS}
      initialOpenByDay={{ [DAY]: 2 }}
      preselectedAt={null}
      addons={[ADDON]}
      paymentMethods={[GCASH]}
      onSubmit={overrides.onSubmit ?? onSubmit}
    />
  )

  render(overrides.inStage ? <BookingStage summary={<p>{PITCH}</p>}>{form}</BookingStage> : form)

  return { onSubmit }
}

/** The summary card, by the label it gives assistive tech. */
function summary() {
  return within(screen.getByRole('region', { name: 'Booking summary' }))
}

async function fillDetails(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full name'), 'Ana Cruz')
  await user.type(screen.getByLabelText('Phone number'), '0917 000 0000')
}

describe('CourtBookingForm', () => {
  it('asks for the details first, then for a date and a start time', () => {
    renderForm()

    expect(screen.getByRole('heading', { name: 'Your details' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Players' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pick your date and time' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Payment' })).toBeInTheDocument()
  })

  it('shows every start time of the day, with the taken ones marked', () => {
    renderForm()

    expect(screen.getByRole('button', { name: /10:00 AM/ })).toBeEnabled()
    expect(screen.getByRole('button', { name: /12:00 PM/ })).toBeDisabled()
  })

  it('will not confirm a booking before a start time is picked', () => {
    renderForm()

    expect(screen.getByRole('button', { name: 'Pick a date and time' })).toBeDisabled()
  })

  it('prices the picked slot in the summary and on the button', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /10:00 AM/ }))

    expect(summary().getByText('Court 1 · 1 hr')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm booking/ })).toBeEnabled()
  })

  it('adds a ticked extra to the summary', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /10:00 AM/ }))
    await user.click(screen.getByRole('checkbox', { name: /Paddle rental/ }))

    expect(summary().getByText('Paddle rental')).toBeInTheDocument()
  })

  it('sends the chosen slot and the contact details, and no price', async () => {
    const user = userEvent.setup()
    const { onSubmit } = renderForm()

    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: /10:00 AM/ }))
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))

    const form = onSubmit.mock.calls[0]?.[0] as FormData
    const order = JSON.parse(String(form.get('order')))

    expect(order).toMatchObject({
      clubId: 'club-1',
      contactName: 'Ana Cruz',
      contactEmail: '09170000000@guest.invalid',
      contactPhone: '0917 000 0000',
      paymentMethodId: 'gcash',
      courts: [
        {
          courtId: 'court-1',
          startsAt: '2026-09-27T02:00:00.000Z',
          endsAt: '2026-09-27T03:00:00.000Z',
        },
      ],
    })
    expect(order.items).toEqual([])
    expect(JSON.stringify(order)).not.toContain('90000')
  })

  it('shows the reservation number once the court is held', async () => {
    const user = userEvent.setup()
    renderForm()

    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: /10:00 AM/ }))
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }))

    expect(await screen.findByText('HP-1234')).toBeInTheDocument()
  })

  it('takes the court card away once the court is held', async () => {
    // Arrange — the page shows the court's pitch above the form.
    const user = userEvent.setup()
    renderForm({ inStage: true })

    expect(screen.getByText(PITCH)).toBeInTheDocument()

    // Act
    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: /10:00 AM/ }))
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }))

    // Assert — the confirmation stands on its own, with no pitch above it.
    expect(await screen.findByText('HP-1234')).toBeInTheDocument()
    expect(screen.queryByText(PITCH)).not.toBeInTheDocument()
  })

  it('leaves the court card up when the booking is refused', async () => {
    // Arrange
    const user = userEvent.setup()
    renderForm({
      inStage: true,
      onSubmit: vi.fn(async () => err('That time was just taken. Pick another.')),
    })

    // Act
    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: /10:00 AM/ }))
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }))

    // Assert — nothing was booked, so the court still has to be sold.
    expect(await screen.findByRole('alert')).toHaveTextContent('That time was just taken.')
    expect(screen.getByText(PITCH)).toBeInTheDocument()
  })

  it('keeps what was typed and says why when the booking is refused', async () => {
    const user = userEvent.setup()
    renderForm({
      onSubmit: vi.fn(async () => err('That time was just taken. Pick another.')),
    })

    await fillDetails(user)
    await user.click(screen.getByRole('button', { name: /10:00 AM/ }))
    await user.click(screen.getByRole('button', { name: /Confirm booking/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That time was just taken.')
    // The details are still there, so the customer only has to choose a time.
    expect(screen.getByLabelText('Full name')).toHaveValue('Ana Cruz')
  })
})
