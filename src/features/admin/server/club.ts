import 'server-only'

import { updateTag } from 'next/cache'
import { clubSettingsSchema } from '@/lib/api/admin-schemas'
import { err, ok, type Result } from '@/lib/api/result'
import { invalid, withStaff } from './session'
import { updateClubSettings } from '@/lib/repositories/clubs'
import { CATALOG_TAG } from '@/features/courts/catalog'
import type { Club } from '@/lib/repositories/mappers'

/**
 * Club-wide settings. Admin-only: the RLS policy on `clubs` already requires
 * the admin role, so the check here is for a clear message, not the boundary.
 */
export async function saveClubSettings(input: unknown): Promise<Result<Club>> {
  const parsed = clubSettingsSchema.safeParse(input)

  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? 'Check the club settings')
  }

  const outer = await withStaff(async ({ staff, client }): Promise<Result<Club>> => {
    if (staff.role !== 'admin') {
      return err('Only an administrator can change club settings', 'FORBIDDEN')
    }

    const club = await updateClubSettings(client, staff.clubId, {
      ...parsed.data,
      phone: parsed.data.phone || null,
      groupBookingNote: parsed.data.groupBookingNote || null,
    })

    updateTag(CATALOG_TAG)

    return ok(club)
  })

  return outer.success ? outer.data : outer
}
