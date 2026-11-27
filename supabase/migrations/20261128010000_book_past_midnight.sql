-- The courts stay open past midnight, so a 12:00 AM start can be sold on every
-- court. A closing time at or before the opening time now means the next
-- morning: 06:00 until 01:00 is a nineteen hour day, and the last one-hour
-- session begins at 12:00 AM.
--
-- Replaces the old ordering check, which rejected exactly that.
alter table clubs drop constraint clubs_hours_ordered;

alter table clubs
  add constraint clubs_hours_ordered check (closes_at <> opens_at);

-- A club that used to close at midnight gains the hour that makes the 12:00 AM
-- start bookable, and the slot grid follows the same rule in the app.
update clubs
set closes_at = '01:00'
where closes_at >= '24:00';

-- ---------------------------------------------------------------------------
-- report_club_totals counted open minutes as closes_at - opens_at, which goes
-- negative once the close is carried past midnight. The return contract is
-- unchanged: same five columns, so every existing caller keeps working.
-- ---------------------------------------------------------------------------

create or replace function report_club_totals(
  p_club_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  bookings_count bigint,
  courts_revenue_cents bigint,
  items_revenue_cents bigint,
  booked_minutes bigint,
  open_minutes bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with scoped as (
    select b.*
    from bookings b
    where b.club_id = p_club_id
      and b.status in ('confirmed', 'completed')
      and b.starts_at < p_to
      and b.ends_at > p_from
  ),
  capacity as (
    select
      (select count(*) from courts where club_id = p_club_id and is_active) *
      (
        select case
                 when closes_at > opens_at
                   then extract(epoch from (closes_at - opens_at)) / 60
                 else extract(epoch from (closes_at - opens_at + interval '24 hours')) / 60
               end
        from clubs
        where id = p_club_id
      ) *
      greatest(ceil(extract(epoch from (p_to - p_from)) / 86400), 1) as minutes
  )
  select
    (select count(*) from scoped),
    coalesce((
      select sum(courts_subtotal_cents + extra_players_fee_cents) from scoped
    ), 0)::bigint,
    coalesce((select sum(items_subtotal_cents) from scoped), 0)::bigint,
    coalesce((
      select sum(extract(epoch from (bc.ends_at - bc.starts_at)) / 60)
      from booking_courts bc
      join scoped s on s.id = bc.booking_id
    ), 0)::bigint,
    (select minutes from capacity)::bigint
  where is_staff(p_club_id);
$$;