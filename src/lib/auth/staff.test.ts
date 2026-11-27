import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeClient, fakeTable, callsFor, type FakeResult } from '../../../test/postgrest-fake'

const getUser = vi.fn()
const createSupabaseServerClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient }))

const { getCurrentStaff, getStaffAccess } = await import('./staff')

const CLUB_ROW = {
  id: 'club-1',
  name: 'Hassy Pickleball Court',
  slug: 'hassy',
  timezone: 'Asia/Manila',
  currency: 'PHP',
  opens_at: '06:00:00',
  closes_at: '22:00:00',
  slot_minutes: 30,
  min_duration_minutes: 30,
  max_duration_minutes: 240,
  phone: '(02) 8123-4567',
  cancellation_window_hours: 12,
  group_booking_note: null,
}

const STAFF_ROW = {
  id: 'staff-1',
  user_id: 'user-1',
  club_id: 'club-1',
  role: 'admin',
  full_name: 'Mika Reyes',
  clubs: CLUB_ROW,
}

function clientReturning(result: FakeResult) {
  const staff = fakeTable(result)
  const client = fakeClient({ staff })

  return { client: { ...client, auth: { getUser } }, staff }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getCurrentStaff', () => {
  it('returns null when nobody is signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { client, staff } = clientReturning({ data: STAFF_ROW, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    expect(await getCurrentStaff()).toBeNull()
    // No point querying staff for a request that has no user.
    expect(callsFor(staff, 'select')).toHaveLength(0)
  })

  it('revalidates the user against the auth server rather than trusting the cookie', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client } = clientReturning({ data: STAFF_ROW, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    await getCurrentStaff()

    expect(getUser).toHaveBeenCalled()
  })

  it('returns the staff record for a signed-in staff member', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client } = clientReturning({ data: STAFF_ROW, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    const staff = await getCurrentStaff()

    expect(staff).toEqual({
      id: 'staff-1',
      userId: 'user-1',
      clubId: 'club-1',
      role: 'admin',
      fullName: 'Mika Reyes',
    })
  })

  it('only matches an active staff row, so a revoked member loses access', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client, staff } = clientReturning({ data: STAFF_ROW, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    await getCurrentStaff()

    expect(callsFor(staff, 'eq')).toContainEqual(
      expect.objectContaining({ args: ['is_active', true] }),
    )
  })

  it('scopes the lookup to the signed-in user, never to an arbitrary id', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client, staff } = clientReturning({ data: STAFF_ROW, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    await getCurrentStaff()

    expect(callsFor(staff, 'eq')).toContainEqual(
      expect.objectContaining({ args: ['user_id', 'user-1'] }),
    )
  })

  it('returns null when the signed-in user has no staff row', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client } = clientReturning({ data: null, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    expect(await getCurrentStaff()).toBeNull()
  })

  it('fails closed when the staff query errors, rather than granting access', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client } = clientReturning({ data: STAFF_ROW, error: { message: 'rls denied' } })
    createSupabaseServerClient.mockResolvedValue(client)

    expect(await getCurrentStaff()).toBeNull()
  })
})

/**
 * The two ways to have no staff record are not the same problem. Nobody signed
 * in should be asked to sign in; someone already signed in should not be, or
 * they are sent back to a form they have just completed and the console looks
 * broken rather than closed.
 */
describe('getStaffAccess', () => {
  it('reports anonymous when nobody is signed in', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { client } = clientReturning({ data: STAFF_ROW, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    expect(await getStaffAccess()).toEqual({ status: 'anonymous' })
  })

  it('separates a signed-in non-staff user from an anonymous one', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client } = clientReturning({ data: null, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    expect(await getStaffAccess()).toEqual({ status: 'not-staff' })
  })

  it('carries the staff record and its club when the signed-in user is staff', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client } = clientReturning({ data: STAFF_ROW, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    expect(await getStaffAccess()).toEqual({
      status: 'staff',
      staff: {
        id: 'staff-1',
        userId: 'user-1',
        clubId: 'club-1',
        role: 'admin',
        fullName: 'Mika Reyes',
      },
      // The club rides along in the same query: every screen below needs its
      // timezone, and a second lookup was a round trip before any data loaded.
      club: {
        id: 'club-1',
        name: 'Hassy Pickleball Court',
        slug: 'hassy',
        timeZone: 'Asia/Manila',
        currency: 'PHP',
        opensAt: '06:00:00',
        closesAt: '22:00:00',
        slotMinutes: 30,
        minDurationMinutes: 30,
        maxDurationMinutes: 240,
        phone: '(02) 8123-4567',
        cancellationWindowHours: 12,
        groupBookingNote: null,
      },
    })
  })

  it('reads the club through the staff query rather than a second lookup', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client, staff } = clientReturning({ data: STAFF_ROW, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    await getStaffAccess()

    expect(callsFor(staff, 'select')[0]?.args[0]).toContain('clubs(*)')
    // One table read, not two: `staff` is the only `from()` target.
    expect(client.from).toHaveBeenCalledTimes(1)
  })

  it('fails closed to not-staff when the staff row has no readable club', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client } = clientReturning({ data: { ...STAFF_ROW, clubs: null }, error: null })
    createSupabaseServerClient.mockResolvedValue(client)

    expect(await getStaffAccess()).toEqual({ status: 'not-staff' })
  })

  it('fails closed to not-staff when the lookup errors', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { client } = clientReturning({ data: STAFF_ROW, error: { message: 'rls denied' } })
    createSupabaseServerClient.mockResolvedValue(client)

    expect(await getStaffAccess()).toEqual({ status: 'not-staff' })
  })
})
