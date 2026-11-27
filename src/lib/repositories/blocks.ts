import 'server-only'

import { toAvailabilityBlock, type AvailabilityBlock } from './booking-mappers'
import { MAX_ROWS, raise, type Client } from './support'
import type { Enums } from './rows'

/**
 * Staff-created holds on a court: maintenance, leagues, private hire, closures.
 * Conflicts are decided by the database — an overlapping block, or a block over
 * a live booking, is rejected there, and the SQLSTATE reaches callers via
 * RepositoryError.code.
 */

export type BlockWindow = {
  readonly clubId: string
  readonly from: Date
  readonly to: Date
}

export type CreateBlockInput = {
  readonly courtId: string
  readonly kind: Enums['block_kind']
  readonly reason: string | null
  readonly startsAt: Date
  readonly endsAt: Date
  /** auth.users id, matching availability_blocks.created_by. */
  readonly createdByUserId: string | null
}

/**
 * Scoped by club, not by a list of court ids. Blocks carry no club of their
 * own, so the club arrives through the court join; doing it here means a caller
 * can ask for courts, bookings and blocks in one round of requests instead of
 * reading the court list first just to build an `in` filter.
 *
 * The embedded `courts!inner(club_id)` is a filter, not payload: rows whose
 * court belongs to another club drop out, and RLS on `courts` still applies.
 */
export async function listBlocksInWindow(
  client: Client,
  window: BlockWindow,
): Promise<readonly AvailabilityBlock[]> {
  const { data, error } = await client
    .from('availability_blocks')
    .select('*, courts!inner(club_id)')
    .eq('courts.club_id', window.clubId)
    .lt('starts_at', window.to.toISOString())
    .gt('ends_at', window.from.toISOString())
    .order('starts_at', { ascending: true })
    .limit(MAX_ROWS)

  raise('Failed to load availability blocks', error)

  return (data ?? []).map(toAvailabilityBlock)
}

export async function createAvailabilityBlock(
  client: Client,
  input: CreateBlockInput,
): Promise<AvailabilityBlock> {
  const { data, error } = await client
    .from('availability_blocks')
    .insert({
      court_id: input.courtId,
      kind: input.kind,
      reason: input.reason,
      starts_at: input.startsAt.toISOString(),
      ends_at: input.endsAt.toISOString(),
      created_by: input.createdByUserId,
    })
    .select('*')
    .single()

  raise('Failed to create availability block', error)

  return toAvailabilityBlock(data as NonNullable<typeof data>)
}

export async function deleteAvailabilityBlock(client: Client, blockId: string): Promise<void> {
  const { error } = await client.from('availability_blocks').delete().eq('id', blockId)

  raise('Failed to delete availability block', error)
}
