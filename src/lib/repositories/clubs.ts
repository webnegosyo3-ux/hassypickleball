import 'server-only'

import { toClub, type Club } from './mappers'
import { raise, type Client } from './support'

/** Club reads. The club carries the timezone and opening hours every other read model needs. */

export async function findClubBySlug(client: Client, slug: string): Promise<Club | null> {
  const { data, error } = await client.from('clubs').select('*').eq('slug', slug).maybeSingle()

  raise('Failed to load club', error)

  return data ? toClub(data) : null
}

export async function findClubById(client: Client, clubId: string): Promise<Club | null> {
  const { data, error } = await client.from('clubs').select('*').eq('id', clubId).maybeSingle()

  raise('Failed to load club', error)

  return data ? toClub(data) : null
}

export type ClubSettingsPatch = {
  readonly name: string
  readonly phone: string | null
  readonly opensAt: string
  readonly closesAt: string
  readonly slotMinutes: number
  readonly minDurationMinutes: number
  readonly maxDurationMinutes: number
  readonly cancellationWindowHours: number
  readonly groupBookingNote: string | null
}

export async function updateClubSettings(
  client: Client,
  clubId: string,
  patch: ClubSettingsPatch,
): Promise<Club> {
  const { data, error } = await client
    .from('clubs')
    .update({
      name: patch.name,
      phone: patch.phone,
      opens_at: patch.opensAt,
      closes_at: patch.closesAt,
      slot_minutes: patch.slotMinutes,
      min_duration_minutes: patch.minDurationMinutes,
      max_duration_minutes: patch.maxDurationMinutes,
      cancellation_window_hours: patch.cancellationWindowHours,
      group_booking_note: patch.groupBookingNote,
    })
    .eq('id', clubId)
    .select('*')
    .single()

  raise('Failed to update club', error)

  return toClub(data as NonNullable<typeof data>)
}
