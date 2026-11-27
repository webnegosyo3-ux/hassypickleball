import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The console's front door, which has three callers and not two.
 *
 * Sending a signed-in non-staff user to the sign-in page produced a loop: the
 * credentials were accepted, the layout found no staff row, and the browser
 * landed back on a form it had just submitted with nothing said. Whatever else
 * changes here, that redirect must not come back.
 */

const getStaffAccess = vi.fn()
/** The real redirect() throws to stop rendering; a stub that returns would let
 *  the layout run on into branches Next.js would never reach. */
const redirect = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_REDIRECT')
  }),
)

vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/auth/staff', () => ({ getStaffAccess }))
vi.mock('@/features/admin/ui/admin-nav', () => ({
  AdminNav: ({ clubName, staffName }: { clubName: string; staffName: string }) => (
    <div data-testid="admin-nav">
      {clubName} / {staffName}
    </div>
  ),
}))

const { default: AdminLayout } = await import('./layout')

const STAFF = {
  id: 'staff-1',
  userId: 'user-1',
  clubId: 'club-1',
  role: 'admin' as const,
  fullName: 'Mika Reyes',
}

async function renderLayout() {
  render(await AdminLayout({ children: <p>Console</p> }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AdminLayout', () => {
  it('sends an anonymous visitor to the staff sign-in page', async () => {
    getStaffAccess.mockResolvedValue({ status: 'anonymous' })

    await expect(renderLayout()).rejects.toThrow('NEXT_REDIRECT')

    expect(redirect).toHaveBeenCalledWith('/staff/sign-in')
  })

  it('does not bounce a signed-in user who is not staff back to sign-in', async () => {
    getStaffAccess.mockResolvedValue({ status: 'not-staff' })

    await renderLayout()

    expect(redirect).not.toHaveBeenCalled()
  })

  it('tells a signed-in non-staff user why the console is closed to them', async () => {
    getStaffAccess.mockResolvedValue({ status: 'not-staff' })

    await renderLayout()

    expect(screen.getByRole('heading', { name: /no admin access/i })).toBeInTheDocument()
  })

  it('offers a signed-in non-staff user a way to try another account', async () => {
    getStaffAccess.mockResolvedValue({ status: 'not-staff' })

    await renderLayout()

    expect(screen.getByRole('link', { name: /different account/i })).toHaveAttribute(
      'href',
      '/staff/sign-in',
    )
  })

  it('withholds the console from a signed-in non-staff user', async () => {
    getStaffAccess.mockResolvedValue({ status: 'not-staff' })

    await renderLayout()

    expect(screen.queryByText('Console')).not.toBeInTheDocument()
    expect(screen.queryByTestId('admin-nav')).not.toBeInTheDocument()
  })

  it('renders the console for a staff member', async () => {
    getStaffAccess.mockResolvedValue({ status: 'staff', staff: STAFF })

    await renderLayout()

    expect(screen.getByTestId('admin-nav')).toHaveTextContent('HASSY PICKLEBALL COURT / Mika Reyes')
    expect(screen.getByText('Console')).toBeInTheDocument()
  })
})
