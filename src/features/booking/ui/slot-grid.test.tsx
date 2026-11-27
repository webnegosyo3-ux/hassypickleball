import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SlotGrid } from './slot-grid'
import type { AvailabilitySlot } from '@/lib/services/availability'

const MANILA = 'Asia/Manila'

function slot(overrides: Partial<AvailabilitySlot> = {}): AvailabilitySlot {
  return {
    startsAt: new Date('2026-03-15T22:00:00Z'), // 06:00 Manila
    endsAt: new Date('2026-03-15T23:00:00Z'),
    priceCents: 60000,
    isAvailable: true,
    isBlocked: false,
    isPast: false,
    ...overrides,
  }
}

describe('SlotGrid', () => {
  it('labels each slot with the club-local start time', () => {
    render(<SlotGrid slots={[slot()]} timeZone={MANILA} currency="PHP" onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: /6:00 AM/ })).toBeInTheDocument()
  })

  it('shows the price for each slot', () => {
    render(<SlotGrid slots={[slot()]} timeZone={MANILA} currency="PHP" onSelect={vi.fn()} />)

    expect(screen.getByRole('button', { name: /₱600/ })).toBeInTheDocument()
  })

  it('shows taken slots rather than hiding them, matching the design', () => {
    render(
      <SlotGrid
        slots={[slot({ isAvailable: false })]}
        timeZone={MANILA}
        currency="PHP"
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /6:00 AM/ })).toBeInTheDocument()
  })

  it('disables a taken slot so it cannot be selected', () => {
    render(
      <SlotGrid
        slots={[slot({ isAvailable: false })]}
        timeZone={MANILA}
        currency="PHP"
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /6:00 AM/ })).toBeDisabled()
  })

  it('calls onSelect with the slot when an available time is chosen', async () => {
    const onSelect = vi.fn()
    const available = slot()

    render(<SlotGrid slots={[available]} timeZone={MANILA} currency="PHP" onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /6:00 AM/ }))

    expect(onSelect).toHaveBeenCalledWith(available)
  })

  it('does not call onSelect for a taken slot', async () => {
    const onSelect = vi.fn()

    render(
      <SlotGrid
        slots={[slot({ isAvailable: false })]}
        timeZone={MANILA}
        currency="PHP"
        onSelect={onSelect}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /6:00 AM/ }))

    expect(onSelect).not.toHaveBeenCalled()
  })

  it('marks a taken slot for assistive tech, not by colour alone', () => {
    render(
      <SlotGrid
        slots={[slot({ isAvailable: false })]}
        timeZone={MANILA}
        currency="PHP"
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /booked/i })).toBeInTheDocument()
  })

  it('tells a slot the club is holding apart from one a customer booked', () => {
    render(
      <SlotGrid
        slots={[slot({ isAvailable: false, isBlocked: true })]}
        timeZone={MANILA}
        currency="PHP"
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /blocked/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /booked/i })).not.toBeInTheDocument()
  })

  it('tells the customer when the day is fully booked instead of rendering nothing', () => {
    render(<SlotGrid slots={[]} timeZone={MANILA} currency="PHP" onSelect={vi.fn()} />)

    expect(screen.getByText(/no start times/i)).toBeInTheDocument()
  })

  it('marks the selected slot as pressed', () => {
    const chosen = slot()

    render(
      <SlotGrid
        slots={[chosen]}
        timeZone={MANILA}
        currency="PHP"
        selectedStartsAt={chosen.startsAt}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /6:00 AM/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('leaves other slots unpressed', () => {
    const chosen = slot()
    const other = slot({
      startsAt: new Date('2026-03-15T23:00:00Z'),
      endsAt: new Date('2026-03-16T00:00:00Z'),
    })

    render(
      <SlotGrid
        slots={[chosen, other]}
        timeZone={MANILA}
        currency="PHP"
        selectedStartsAt={chosen.startsAt}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /7:00 AM/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders prices through the formatter, never raw centavos', () => {
    render(
      <SlotGrid
        slots={[slot({ priceCents: 123456 })]}
        timeZone={MANILA}
        currency="PHP"
        onSelect={vi.fn()}
      />,
    )

    expect(screen.queryByText(/123456/)).not.toBeInTheDocument()
  })
})
