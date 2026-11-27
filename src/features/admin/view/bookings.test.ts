import { describe, expect, it } from 'vitest'
import { toBookingDetailView, toBookingRows } from './bookings'
import { club, makeBooking } from '../../../../test/admin-fixtures'

describe('toBookingRows', () => {
  it('carries the reference, customer, and contact the desk needs to call someone', () => {
    // Arrange
    const bookings = [
      makeBooking({
        reference: 'PB-4820',
        contactName: 'Jun Park',
        contactEmail: 'jun@example.com',
        contactPhone: '(555) 771-2280',
        segments: [{ courtId: 'court-1', from: '20:00', to: '21:00' }],
      }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert — a phone number beats an email when staff have to reach someone.
    expect(row.reference).toBe('PB-4820')
    expect(row.name).toBe('Jun Park')
    expect(row.contact).toBe('(555) 771-2280')
  })

  it('falls back to the email when no phone number was given', () => {
    // Arrange
    const bookings = [
      makeBooking({
        contactEmail: 'maya@example.com',
        contactPhone: null,
        segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert
    expect(row.contact).toBe('maya@example.com')
  })

  it('spells out when the session runs in club-local time', () => {
    // Arrange — 5:00 PM Manila for 90 minutes.
    const bookings = [
      makeBooking({ segments: [{ courtId: 'court-1', from: '17:00', to: '18:30' }] }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert
    expect(row.when).toBe('Tue, 04 Aug 2026 · 5:00 PM · 1 hr 30 min')
  })

  it('lists every court a multi-court booking holds, without repeating one', () => {
    // Arrange
    const bookings = [
      makeBooking({
        segments: [
          { courtId: 'court-1', courtName: 'Harbor Court', from: '17:00', to: '18:00' },
          { courtId: 'court-2', courtName: 'Maple Court', from: '17:00', to: '18:00' },
          { courtId: 'court-1', courtName: 'Harbor Court', from: '18:00', to: '19:00' },
        ],
      }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert
    expect(row.court).toBe('Harbor Court, Maple Court')
  })

  it('summarises add-ons with their quantities, or an em dash when there are none', () => {
    // Arrange
    const withExtras = makeBooking({
      id: 'b1',
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      items: [
        { name: 'Paddle rental', quantity: 2 },
        { name: 'Coaching 30 min', quantity: 1 },
      ],
    })
    const withoutExtras = makeBooking({
      id: 'b2',
      segments: [{ courtId: 'court-1', from: '19:00', to: '20:00' }],
    })

    // Act
    const [first, second] = toBookingRows([withExtras, withoutExtras], club)

    // Assert
    expect(first.extras).toBe('Paddle rental ×2, Coaching 30 min')
    expect(second.extras).toBe('—')
  })

  it('formats the total in the club’s currency', () => {
    // Arrange
    const bookings = [
      makeBooking({
        segments: [{ courtId: 'court-1', from: '17:00', to: '18:00', priceCents: 60_000 }],
        items: [{ name: 'Balls', unitPriceCents: 5_000, quantity: 1 }],
      }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert
    expect(row.total).toBe('₱650')
  })

  it('passes the raw status through so the badge, not this layer, picks the wording', () => {
    // Arrange
    const bookings = [
      makeBooking({
        status: 'awaiting_payment',
        segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert
    expect(row.status).toBe('awaiting_payment')
  })

  /**
   * The columns the Orders ledger used to own. Payment status is not booking
   * status: a confirmed booking with an unsettled bank transfer still owes the
   * club, and the desk has to be able to see that on one screen.
   */

  it('names the payment method in words staff use, not database enums', () => {
    // Arrange
    const bookings = [
      makeBooking({
        segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
        payments: [{ method: 'bank_transfer', status: 'pending' }],
      }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert
    expect(row.method).toBe('Bank transfer')
  })

  it('reads as unpaid when no payment has been recorded at all', () => {
    // Arrange
    const bookings = [
      makeBooking({ segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }] }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert
    expect(row.method).toBe('Not recorded')
    expect(row.paymentStatus).toBe('awaiting')
  })

  it('reports a confirmed booking as still awaiting when its transfer has not settled', () => {
    // Arrange
    const bookings = [
      makeBooking({
        status: 'confirmed',
        segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
        payments: [{ method: 'bank_transfer', status: 'pending' }],
      }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert — the two statuses disagree on purpose; both are shown.
    expect(row.status).toBe('confirmed')
    expect(row.paymentStatus).toBe('awaiting')
  })

  it('reports a refund even when an earlier payment on the same booking succeeded', () => {
    // Arrange — the refund is the later, and truer, fact about the money.
    const bookings = [
      makeBooking({
        segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
        payments: [
          { method: 'card', status: 'paid' },
          { method: 'card', status: 'refunded' },
        ],
      }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert
    expect(row.paymentStatus).toBe('refunded')
  })

  it('flags a failed payment so it is not mistaken for one merely awaiting', () => {
    // Arrange
    const bookings = [
      makeBooking({
        segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
        payments: [{ method: 'online', status: 'failed' }],
      }),
    ]

    // Act
    const [row] = toBookingRows(bookings, club)

    // Assert
    expect(row.paymentStatus).toBe('failed')
  })
})

describe('toBookingDetailView', () => {
  it('carries every named player into the detail staff manages', () => {
    const booking = makeBooking({
      players: ['Ana Cruz', 'Ben Uy'],
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
    })

    const detail = toBookingDetailView(booking, club)

    expect(detail.players).toEqual(['Ana Cruz', 'Ben Uy'])
  })

  it('breaks the total into the court and add-on lines behind it', () => {
    // Arrange
    const booking = makeBooking({
      reference: 'PB-4821',
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:30', priceCents: 90_000 }],
      items: [{ name: 'Paddle rental', unitPriceCents: 10_000, quantity: 2 }],
    })

    // Act
    const detail = toBookingDetailView(booking, club)

    // Assert
    expect(detail.reference).toBe('PB-4821')
    expect(detail.lines).toEqual([
      { label: 'Court time', value: '₱900' },
      { label: 'Paddle rental ×2', value: '₱200' },
    ])
    expect(detail.total).toBe('₱1,100')
  })

  it('lists the metadata staff scan first: who, where, when, and how to reach them', () => {
    // Arrange
    const booking = makeBooking({
      contactName: 'Maya Halvorsen',
      contactPhone: '(555) 771-2280',
      segments: [{ courtId: 'court-1', courtName: 'Harbor Court', from: '17:00', to: '18:00' }],
    })

    // Act
    const detail = toBookingDetailView(booking, club)

    // Assert
    expect(detail.meta).toEqual([
      { label: 'Customer', value: 'Maya Halvorsen' },
      { label: 'Contact', value: '(555) 771-2280' },
      { label: 'Court', value: 'Harbor Court' },
      { label: 'When', value: 'Tue, 04 Aug 2026 · 5:00 PM · 1 hr' },
    ])
  })

  it('shows the booking note when there is one, and says so plainly when there is not', () => {
    // Arrange
    const withNote = makeBooking({
      id: 'b1',
      notes: 'Member — approved for desk payment.',
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
    })
    const withoutNote = makeBooking({
      id: 'b2',
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
    })

    // Act & Assert
    expect(toBookingDetailView(withNote, club).note).toBe('Member — approved for desk payment.')
    expect(toBookingDetailView(withoutNote, club).note).toBe('No note on this booking.')
  })

  it('omits the add-on lines entirely for a court-only booking', () => {
    // Arrange
    const booking = makeBooking({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00', priceCents: 60_000 }],
    })

    // Act
    const detail = toBookingDetailView(booking, club)

    // Assert
    expect(detail.lines).toEqual([{ label: 'Court time', value: '₱600' }])
  })

  it('offers only the moves the server would accept from where the booking is', () => {
    // Arrange
    const awaiting = makeBooking({
      id: 'b1',
      status: 'awaiting_payment',
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
    })
    const cancelled = makeBooking({
      id: 'b2',
      status: 'cancelled',
      segments: [{ courtId: 'court-1', from: '19:00', to: '20:00' }],
    })

    // Act & Assert
    expect(toBookingDetailView(awaiting, club).nextStatuses).toEqual(['confirmed', 'cancelled'])
    expect(toBookingDetailView(cancelled, club).nextStatuses).toEqual([])
  })

  it('lists every payment with its method, state, and amount', () => {
    // Arrange
    const booking = makeBooking({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00', priceCents: 60_000 }],
      payments: [{ method: 'gcash', status: 'paid', amountCents: 60_000 }],
    })

    // Act
    const [payment] = toBookingDetailView(booking, club).payments

    // Assert
    expect(payment).toMatchObject({ method: 'GCash', status: 'paid', amount: '₱600' })
  })

  it('leaves a payment with no uploaded proof without a link to one', () => {
    // Arrange
    const booking = makeBooking({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      payments: [{ method: 'cash', status: 'paid' }],
    })

    // Act
    const [payment] = toBookingDetailView(booking, club).payments

    // Assert
    expect(payment.proofHref).toBeNull()
  })

  /**
   * The bucket is private, so the page signs a time-boxed URL per stored path
   * before rendering. The view takes the signed links rather than the paths:
   * signing needs a server, and this module runs anywhere.
   */
  it('attaches the signed link for a proof the page has already signed', () => {
    // Arrange
    const booking = makeBooking({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      payments: [{ method: 'gcash', status: 'pending', proofUrl: 'PB-4821/proof.png' }],
    })

    // Act
    const detail = toBookingDetailView(booking, club, {
      urls: { 'PB-4821/proof.png': 'https://cdn.example/signed?token=abc' },
      failures: {},
    })

    // Assert
    expect(detail.payments[0].proofHref).toBe('https://cdn.example/signed?token=abc')
  })

  it('leaves a proof unlinked when signing it failed, rather than a broken link', () => {
    // Arrange
    const booking = makeBooking({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      payments: [{ method: 'gcash', status: 'pending', proofUrl: 'PB-4821/proof.png' }],
    })

    // Act — nothing was signed.
    const detail = toBookingDetailView(booking, club, { urls: {}, failures: {} })

    // Assert
    expect(detail.payments[0].proofHref).toBeNull()
    // Still a proof on file: the desk has to know to ask about it.
    expect(detail.payments[0].hasProof).toBe(true)
    expect(detail.payments[0].proofError).toBeTruthy()
  })

  /**
   * "Could not be opened" covered three different problems, and the one an
   * empty storage secret produces cannot be fixed by anyone at the club.
   */
  it('carries the reason a proof could not be signed, so it can be acted on', () => {
    // Arrange
    const booking = makeBooking({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00' }],
      payments: [{ method: 'gcash', status: 'pending', proofUrl: 'PB-4821/proof.png' }],
    })

    // Act
    const detail = toBookingDetailView(booking, club, {
      urls: {},
      failures: { 'PB-4821/proof.png': 'SUPABASE_SERVICE_ROLE_KEY is not set on this server.' },
    })

    // Assert
    expect(detail.payments[0].proofError).toBe(
      'SUPABASE_SERVICE_ROLE_KEY is not set on this server.',
    )
  })

  /** What the record-payment form should default to, so staff do not retype it. */
  it('reports what is still owed, ignoring payments that never settled', () => {
    // Arrange
    const booking = makeBooking({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00', priceCents: 60_000 }],
      payments: [
        { method: 'gcash', status: 'failed', amountCents: 60_000 },
        { method: 'cash', status: 'paid', amountCents: 20_000 },
      ],
    })

    // Act
    const detail = toBookingDetailView(booking, club)

    // Assert
    expect(detail.outstandingCents).toBe(40_000)
  })

  it('counts a refunded payment as money no longer held, so the balance reopens', () => {
    // Arrange
    const booking = makeBooking({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00', priceCents: 60_000 }],
      payments: [
        { method: 'card', status: 'paid', amountCents: 60_000 },
        { method: 'card', status: 'refunded', amountCents: 60_000 },
      ],
    })

    // Act
    const detail = toBookingDetailView(booking, club)

    // Assert
    expect(detail.outstandingCents).toBe(60_000)
  })

  it('never reports a negative balance when a booking was overpaid', () => {
    // Arrange
    const booking = makeBooking({
      segments: [{ courtId: 'court-1', from: '17:00', to: '18:00', priceCents: 60_000 }],
      payments: [{ method: 'cash', status: 'paid', amountCents: 80_000 }],
    })

    // Act & Assert
    expect(toBookingDetailView(booking, club).outstandingCents).toBe(0)
  })
})
