/** The admin console's sections, in the order the design's tab strip shows them. */

export type AdminNavItem = {
  readonly label: string
  readonly href: string
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { label: 'Schedule', href: '/admin' },
  // Bookings and payments are one section: an order was only ever a booking
  // seen through its payments, and two tabs meant reconciling on one and
  // confirming on the other.
  { label: 'Bookings', href: '/admin/bookings' },
  { label: 'Courts', href: '/admin/courts' },
  { label: 'Products', href: '/admin/products' },
  { label: 'Payment methods', href: '/admin/payment-methods' },
  { label: 'Customers', href: '/admin/customers' },
  { label: 'Reports', href: '/admin/reports' },
  { label: 'Settings', href: '/admin/settings' },
]

const CONSOLE_ROOT = '/admin'

/**
 * Whether a tab should read as the current section.
 *
 * The schedule lives at the console root, so it is matched exactly — a prefix
 * match there would light up Schedule on every other page. Every other section
 * also claims its nested detail routes, so /admin/bookings/PB-4821 keeps Bookings lit.
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === CONSOLE_ROOT) {
    return pathname === CONSOLE_ROOT
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}
