import { describe, expect, it } from 'vitest'
import { addCourtToCart, removeCourtFromCart, setItemQuantity, summariseCart } from './cart'
import type { CartItem, CourtSelection } from './types'

function selection(overrides: Partial<CourtSelection> = {}): CourtSelection {
  return {
    courtId: 'court-1',
    startsAt: new Date('2026-03-16T02:00:00Z'),
    endsAt: new Date('2026-03-16T03:00:00Z'),
    priceCents: 60000,
    ...overrides,
  }
}

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'p-1',
    name: 'Paddle rental',
    unitPriceCents: 20000,
    quantity: 1,
    ...overrides,
  }
}

describe('summariseCart', () => {
  it('totals courts and items separately and together', () => {
    const summary = summariseCart({
      courts: [selection(), selection({ courtId: 'court-2', priceCents: 70000 })],
      items: [item(), item({ productId: 'p-2', unitPriceCents: 15000, quantity: 2 })],
    })

    expect(summary.courtsSubtotalCents).toBe(130000)
    expect(summary.itemsSubtotalCents).toBe(50000)
    expect(summary.totalCents).toBe(180000)
  })

  it('reports zero totals for an empty cart', () => {
    const summary = summariseCart({ courts: [], items: [] })

    expect(summary).toMatchObject({
      courtsSubtotalCents: 0,
      itemsSubtotalCents: 0,
      totalCents: 0,
      courtCount: 0,
      itemCount: 0,
    })
  })

  it('counts item quantities rather than distinct lines', () => {
    const summary = summariseCart({ courts: [], items: [item({ quantity: 3 })] })

    expect(summary.itemCount).toBe(3)
  })

  it('reports the earliest start and latest end across court segments', () => {
    const summary = summariseCart({
      courts: [
        selection({
          startsAt: new Date('2026-03-16T05:00:00Z'),
          endsAt: new Date('2026-03-16T06:00:00Z'),
        }),
        selection({ courtId: 'court-2' }),
      ],
      items: [],
    })

    expect(summary.startsAt?.toISOString()).toBe('2026-03-16T02:00:00.000Z')
    expect(summary.endsAt?.toISOString()).toBe('2026-03-16T06:00:00.000Z')
  })

  it('has no window when there are no court segments', () => {
    const summary = summariseCart({ courts: [], items: [item()] })

    expect(summary.startsAt).toBeNull()
    expect(summary.endsAt).toBeNull()
  })
})

describe('addCourtToCart', () => {
  it('returns a new array without mutating the original', () => {
    const courts = [selection()]

    const next = addCourtToCart(courts, selection({ courtId: 'court-2' }))

    expect(next).toHaveLength(2)
    expect(courts).toHaveLength(1)
  })

  it('rejects a segment that overlaps one already in the cart on the same court', () => {
    const courts = [selection()]

    expect(() =>
      addCourtToCart(
        courts,
        selection({
          startsAt: new Date('2026-03-16T02:30:00Z'),
          endsAt: new Date('2026-03-16T03:30:00Z'),
        }),
      ),
    ).toThrow(/already in your booking/i)
  })

  it('allows the same time on a different court', () => {
    const courts = [selection()]

    expect(addCourtToCart(courts, selection({ courtId: 'court-2' }))).toHaveLength(2)
  })
})

describe('removeCourtFromCart', () => {
  it('removes only the matching court and start time', () => {
    const courts = [selection(), selection({ courtId: 'court-2' })]

    const next = removeCourtFromCart(courts, {
      courtId: 'court-1',
      startsAt: new Date('2026-03-16T02:00:00Z'),
    })

    expect(next.map((c) => c.courtId)).toEqual(['court-2'])
    expect(courts).toHaveLength(2)
  })

  it('is a no-op when nothing matches', () => {
    const courts = [selection()]

    expect(removeCourtFromCart(courts, { courtId: 'court-9', startsAt: new Date() })).toHaveLength(
      1,
    )
  })
})

describe('setItemQuantity', () => {
  it('updates the quantity immutably', () => {
    const items = [item()]

    const next = setItemQuantity(items, 'p-1', 4)

    expect(next[0].quantity).toBe(4)
    expect(items[0].quantity).toBe(1)
  })

  it('removes the line when the quantity drops to zero', () => {
    expect(setItemQuantity([item()], 'p-1', 0)).toEqual([])
  })

  it('treats a negative quantity as removal', () => {
    expect(setItemQuantity([item()], 'p-1', -2)).toEqual([])
  })

  it('leaves other lines untouched', () => {
    const items = [item(), item({ productId: 'p-2' })]

    const next = setItemQuantity(items, 'p-1', 5)

    expect(next.find((i) => i.productId === 'p-2')?.quantity).toBe(1)
  })
})
