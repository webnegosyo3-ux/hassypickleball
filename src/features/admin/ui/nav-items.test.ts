import { describe, expect, it } from 'vitest'
import { ADMIN_NAV_ITEMS, isNavItemActive } from './nav-items'

describe('ADMIN_NAV_ITEMS', () => {
  it('lists the console sections in the order the design shows them', () => {
    // Courts and Pricing sit with Products: those three configure what a court
    // hour or a bottle of water costs, while Schedule and Bookings run the day.
    expect(ADMIN_NAV_ITEMS.map((item) => item.label)).toEqual([
      'Schedule',
      'Bookings',
      'Courts',
      'Pricing',
      'Products',
      'Payment methods',
      'Customers',
      'Reports',
      'Settings',
    ])
  })

  it('keeps Payment methods active on nested admin routes', () => {
    expect(isNavItemActive('/admin/payment-methods/new', '/admin/payment-methods')).toBe(true)
  })

  it('offers no Orders tab: a booking and its payments are one section', () => {
    // Two tabs meant reconciling a transfer on one and confirming the booking
    // on the other. There was never a second kind of record behind Orders.
    expect(ADMIN_NAV_ITEMS.map((item) => item.href)).not.toContain('/admin/orders')
  })

  it('offers a Pricing tab, because the console now edits pricing rules', () => {
    // The rules that drive every quote used to be seeded straight into the
    // database; /admin/pricing reads and writes them, so the tab ships with it.
    expect(ADMIN_NAV_ITEMS.map((item) => item.href)).toContain('/admin/pricing')
  })

  it('points every section at a route under /admin', () => {
    for (const item of ADMIN_NAV_ITEMS) {
      expect(item.href.startsWith('/admin')).toBe(true)
    }
  })
})

describe('isNavItemActive', () => {
  it('marks a section active on its own route', () => {
    expect(isNavItemActive('/admin/bookings', '/admin/bookings')).toBe(true)
  })

  it('marks a section active on a nested route beneath it', () => {
    expect(isNavItemActive('/admin/bookings/PB-4821', '/admin/bookings')).toBe(true)
  })

  it('does not mark a section active for a sibling with a shared prefix', () => {
    expect(isNavItemActive('/admin/products-archive', '/admin/products')).toBe(false)
  })

  it('only marks Schedule active at the console root, not on every admin page', () => {
    // Arrange — /admin is the schedule route, so a naive prefix match would
    // light up Schedule on every other section too.
    const scheduleHref = '/admin'

    // Act & Assert
    expect(isNavItemActive('/admin', scheduleHref)).toBe(true)
    expect(isNavItemActive('/admin/reports', scheduleHref)).toBe(false)
  })
})
