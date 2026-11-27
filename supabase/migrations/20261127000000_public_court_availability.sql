-- 2026-11-27: what is taken, readable by the people deciding whether to book.
--
-- The storefront has to show which start times are already gone. It could not
-- read that from `booking_courts`, and should not: a booking row is a name, a
-- phone number and a payment behind row-level security, and none of that is the
-- calendar's business.
--
-- So this function returns the intervals and nothing else — no booking id, no
-- reference, no customer. Whoever holds the anon key can learn that 7:00 PM on
-- Saturday is taken; they cannot learn by whom. That is exactly the fact the
-- page draws, so it is the whole of what is granted.
--
-- security definer is what lets it read past RLS. It is enumerated by club and
-- window, is marked stable, and pins search_path, so it can only answer the one
-- question it was written for.

create or replace function court_day_busy(p_club_id uuid, p_from timestamptz, p_to timestamptz)
returns table (court_id uuid, starts_at timestamptz, ends_at timestamptz, is_block boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select bc.court_id, bc.starts_at, bc.ends_at, false as is_block
  from booking_courts bc
  join courts c on c.id = bc.court_id
  where c.club_id = p_club_id
    -- Cancelled bookings free their slot; the live ones are the same four
    -- statuses LIVE_BOOKING_STATUSES lists on the server.
    and bc.status in ('pending', 'awaiting_payment', 'confirmed', 'completed')
    and bc.starts_at < p_to
    and bc.ends_at > p_from

  union all

  select ab.court_id, ab.starts_at, ab.ends_at, true as is_block
  from availability_blocks ab
  join courts c on c.id = ab.court_id
  where c.club_id = p_club_id
    and ab.starts_at < p_to
    and ab.ends_at > p_from

  -- Ordered so the same window always comes back the same way round, which
  -- makes the rows easy to read in a log and cheap to group in code.
  order by 1, 2;
$$;

revoke all on function court_day_busy(uuid, timestamptz, timestamptz) from public;
grant execute on function court_day_busy(uuid, timestamptz, timestamptz) to anon, authenticated, service_role;

comment on function court_day_busy(uuid, timestamptz, timestamptz) is
  'Busy intervals (live bookings and maintenance blocks) for a club. No booking identity is exposed.';
