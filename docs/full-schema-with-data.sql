
-- ===== supabase/migrations/20260101000000_extensions.sql =====
-- Extensions required by the schema.
-- btree_gist lets an EXCLUDE constraint mix equality (court_id) with range overlap.
create extension if not exists btree_gist;

-- citext gives case-insensitive, unique-safe email columns.
create extension if not exists citext;

-- ===== supabase/migrations/20260101000100_enums.sql =====
-- Domain enums. Values mirror the labels used in the Claude Design screens.

create type court_environment as enum ('indoor', 'outdoor');

create type booking_status as enum (
  'pending',
  'awaiting_payment',
  'confirmed',
  'cancelled',
  'completed'
);

create type payment_method as enum ('cash', 'card', 'bank_transfer', 'gcash', 'online');

create type payment_status as enum ('pending', 'paid', 'refunded', 'failed');

create type block_kind as enum ('maintenance', 'league', 'private', 'closed');

create type product_type as enum ('addon', 'cafe');

create type customer_tier as enum ('standard', 'regular', 'pro');

create type staff_role as enum ('admin', 'staff');

-- How a pricing rule transforms the court's base price.
create type rate_kind as enum ('fixed', 'amount_delta', 'percent_delta');

-- ===== supabase/migrations/20260101000200_core_tables.sql =====
-- Core catalog tables: clubs, courts, pricing rules, availability blocks, products.
-- All money is stored as integer minor units (centavos) to avoid float drift.
-- All instants are timestamptz (UTC); club-local rendering uses clubs.timezone.

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Asia/Manila',
  currency char(3) not null default 'PHP',
  opens_at time not null default '06:00',
  closes_at time not null default '22:00',
  slot_minutes smallint not null default 30 check (slot_minutes in (15, 30, 60)),
  min_duration_minutes smallint not null default 60,
  max_duration_minutes smallint not null default 240,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clubs_hours_ordered check (closes_at > opens_at),
  constraint clubs_duration_ordered check (max_duration_minutes >= min_duration_minutes)
);

create trigger clubs_set_updated_at
  before update on clubs
  for each row execute function set_updated_at();

create table courts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  name text not null,
  slug text not null,
  surface text not null,
  environment court_environment not null default 'outdoor',
  is_tournament_grade boolean not null default false,
  blurb text,
  notes text,
  tags text[] not null default '{}',
  includes text[] not null default '{}',
  hero_image_url text,
  base_price_cents integer not null check (base_price_cents >= 0),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, slug)
);

create index courts_club_active_idx on courts (club_id) where is_active;

create trigger courts_set_updated_at
  before update on courts
  for each row execute function set_updated_at();

-- Pricing rules stack in `priority` order over the court's base price.
create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  court_id uuid references courts (id) on delete cascade,
  label text not null,
  days_of_week smallint[] not null default '{}',
  starts_at_time time,
  ends_at_time time,
  min_duration_minutes smallint,
  applies_to_tier customer_tier,
  kind rate_kind not null,
  value_cents integer,
  value_percent numeric(6, 3),
  priority smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_rules_window_ordered
    check (starts_at_time is null or ends_at_time is null or ends_at_time > starts_at_time),
  constraint pricing_rules_dow_valid
    check (days_of_week <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint pricing_rules_value_matches_kind check (
    (kind = 'percent_delta' and value_percent is not null and value_cents is null)
    or (kind in ('fixed', 'amount_delta') and value_cents is not null and value_percent is null)
  )
);

create index pricing_rules_lookup_idx on pricing_rules (club_id, priority) where is_active;

create trigger pricing_rules_set_updated_at
  before update on pricing_rules
  for each row execute function set_updated_at();

-- Staff-created holds: maintenance, leagues, private hire, closures.
create table availability_blocks (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references courts (id) on delete cascade,
  kind block_kind not null default 'maintenance',
  reason text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint availability_blocks_ordered check (ends_at > starts_at),
  constraint availability_blocks_no_overlap
    exclude using gist (
      court_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    )
);

create index availability_blocks_court_window_idx on availability_blocks (court_id, starts_at, ends_at);

-- Session add-ons and café items shown as "Add to your session" / shop rows.
create table products (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  name text not null,
  description text,
  type product_type not null,
  price_cents integer not null check (price_cents >= 0),
  has_quantity boolean not null default true,
  image_url text,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_club_type_idx on products (club_id, type) where is_active;

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ===== supabase/migrations/20260101000300_booking_tables.sql =====
-- People and bookings.

create table staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  club_id uuid not null references clubs (id) on delete cascade,
  role staff_role not null default 'staff',
  full_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index staff_club_idx on staff (club_id) where is_active;

create table customers (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  auth_user_id uuid references auth.users (id) on delete set null,
  full_name text not null,
  email citext not null,
  phone text,
  tier customer_tier not null default 'standard',
  total_spend_cents bigint not null default 0 check (total_spend_cents >= 0),
  bookings_count integer not null default 0 check (bookings_count >= 0),
  last_visit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (club_id, email)
);

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

create table bookings (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  reference text not null unique,
  customer_id uuid references customers (id) on delete set null,
  -- Guest bookings carry their own contact details; lookup is reference + email.
  contact_name text not null,
  contact_email citext not null,
  contact_phone text,
  status booking_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  courts_subtotal_cents integer not null default 0 check (courts_subtotal_cents >= 0),
  items_subtotal_cents integer not null default 0 check (items_subtotal_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  will_present_id boolean not null default false,
  notes text,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_window_ordered check (ends_at > starts_at)
);

create index bookings_club_window_idx on bookings (club_id, starts_at);
create index bookings_customer_idx on bookings (customer_id);
create index bookings_contact_email_idx on bookings (contact_email);

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

-- One row per court/time segment in a booking. The cart can hold several.
-- `status` is denormalised from bookings so the exclusion constraint can ignore
-- cancelled bookings — a cross-table constraint is not expressible in Postgres.
create table booking_courts (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  court_id uuid not null references courts (id) on delete restrict,
  status booking_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents integer not null check (price_cents >= 0),
  created_at timestamptz not null default now(),
  constraint booking_courts_window_ordered check (ends_at > starts_at),
  -- The core guarantee: two live bookings can never hold the same court at the
  -- same time. Enforced by the database, not by application read-then-write.
  constraint booking_courts_no_double_booking
    exclude using gist (
      court_id with =,
      tstzrange(starts_at, ends_at, '[)') with &&
    ) where (status in ('pending', 'awaiting_payment', 'confirmed', 'completed'))
);

create index booking_courts_booking_idx on booking_courts (booking_id);
create index booking_courts_court_window_idx on booking_courts (court_id, starts_at, ends_at);

-- Keep booking_courts.status in step with the parent booking.
create or replace function sync_booking_courts_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    update booking_courts set status = new.status where booking_id = new.id;
  end if;
  return new;
end;
$$;

create trigger bookings_sync_court_status
  after update of status on bookings
  for each row execute function sync_booking_courts_status();

create table booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  product_id uuid references products (id) on delete set null,
  -- Snapshots so historical bookings survive catalog edits.
  name_snapshot text not null,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity smallint not null default 1 check (quantity > 0),
  line_total_cents integer generated always as (unit_price_cents * quantity) stored,
  created_at timestamptz not null default now()
);

create index booking_items_booking_idx on booking_items (booking_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  method payment_method not null,
  status payment_status not null default 'pending',
  amount_cents integer not null check (amount_cents >= 0),
  -- Gateway/reference id. Null for cash and pay-at-venue.
  external_reference text,
  paid_at timestamptz,
  refunded_at timestamptz,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_booking_idx on payments (booking_id);

create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();

-- ===== supabase/migrations/20260101000400_functions.sql =====
-- Booking references, staff checks, cross-table overlap guards, and the
-- transactional booking entry point.

-- Crockford-style alphabet: no I, L, O, U — unambiguous when read aloud at a desk.
create or replace function generate_booking_reference()
returns text
language plpgsql
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  attempt integer := 0;
begin
  loop
    candidate := 'PB-';
    for _ in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    exit when not exists (select 1 from bookings where reference = candidate);

    attempt := attempt + 1;
    if attempt >= 20 then
      raise exception 'could not allocate a unique booking reference';
    end if;
  end loop;

  return candidate;
end;
$$;

-- Staff membership for the current session. SECURITY DEFINER so RLS policies on
-- `staff` cannot recurse into themselves.
create or replace function is_staff(p_club_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from staff
    where staff.user_id = auth.uid()
      and staff.club_id = p_club_id
      and staff.is_active
  );
$$;

create or replace function is_club_admin(p_club_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from staff
    where staff.user_id = auth.uid()
      and staff.club_id = p_club_id
      and staff.role = 'admin'
      and staff.is_active
  );
$$;

-- Postgres cannot express an EXCLUDE constraint across two tables, so the
-- booking/block conflict is enforced with symmetric triggers instead.
create or replace function reject_booking_over_block()
returns trigger
language plpgsql
as $$
begin
  if new.status not in ('pending', 'awaiting_payment', 'confirmed', 'completed') then
    return new;
  end if;

  if exists (
    select 1
    from availability_blocks b
    where b.court_id = new.court_id
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'court % is blocked during the requested window', new.court_id
      using errcode = 'exclusion_violation';
  end if;

  return new;
end;
$$;

create trigger booking_courts_reject_blocked
  before insert or update on booking_courts
  for each row execute function reject_booking_over_block();

create or replace function reject_block_over_booking()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from booking_courts bc
    where bc.court_id = new.court_id
      and bc.status in ('pending', 'awaiting_payment', 'confirmed', 'completed')
      and tstzrange(bc.starts_at, bc.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
  ) then
    raise exception 'court % already has a live booking during the requested window', new.court_id
      using errcode = 'exclusion_violation';
  end if;

  return new;
end;
$$;

create trigger availability_blocks_reject_booked
  before insert or update on availability_blocks
  for each row execute function reject_block_over_booking();

/*
 * Creates a booking, its court segments, and its line items in one transaction.
 *
 * Court prices arrive pre-computed from the server-side pricing engine
 * (src/lib/domain/pricing.ts) so the rule stack lives in one tested place.
 * Item prices are re-read from `products` here — the client never influences them.
 *
 * Raises exclusion_violation if any requested court/window is already taken.
 */
create or replace function create_booking(
  p_club_id uuid,
  p_contact_name text,
  p_contact_email citext,
  p_contact_phone text,
  p_will_present_id boolean,
  p_notes text,
  p_courts jsonb,
  p_items jsonb default '[]'::jsonb
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_customer_id uuid;
  v_reference text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_courts_subtotal integer := 0;
  v_items_subtotal integer := 0;
begin
  if jsonb_array_length(p_courts) = 0 then
    raise exception 'a booking needs at least one court segment';
  end if;

  select min((c ->> 'starts_at')::timestamptz), max((c ->> 'ends_at')::timestamptz)
    into v_starts_at, v_ends_at
  from jsonb_array_elements(p_courts) as c;

  select coalesce(sum((c ->> 'price_cents')::integer), 0)
    into v_courts_subtotal
  from jsonb_array_elements(p_courts) as c;

  -- Attach to an existing customer record, or create one, keyed by club + email.
  insert into customers (club_id, full_name, email, phone)
  values (p_club_id, p_contact_name, p_contact_email, p_contact_phone)
  on conflict (club_id, email) do update
    set full_name = excluded.full_name,
        phone = coalesce(excluded.phone, customers.phone)
  returning id into v_customer_id;

  v_reference := generate_booking_reference();

  insert into bookings (
    club_id, reference, customer_id, contact_name, contact_email, contact_phone,
    status, starts_at, ends_at, courts_subtotal_cents, will_present_id, notes
  )
  values (
    p_club_id, v_reference, v_customer_id, p_contact_name, p_contact_email, p_contact_phone,
    'awaiting_payment', v_starts_at, v_ends_at, v_courts_subtotal, p_will_present_id, p_notes
  )
  returning * into v_booking;

  insert into booking_courts (booking_id, court_id, status, starts_at, ends_at, price_cents)
  select
    v_booking.id,
    (c ->> 'court_id')::uuid,
    v_booking.status,
    (c ->> 'starts_at')::timestamptz,
    (c ->> 'ends_at')::timestamptz,
    (c ->> 'price_cents')::integer
  from jsonb_array_elements(p_courts) as c;

  insert into booking_items (booking_id, product_id, name_snapshot, unit_price_cents, quantity)
  select
    v_booking.id,
    p.id,
    p.name,
    p.price_cents,
    greatest((i ->> 'quantity')::smallint, 1)
  from jsonb_array_elements(p_items) as i
  join products p
    on p.id = (i ->> 'product_id')::uuid
   and p.club_id = p_club_id
   and p.is_active;

  select coalesce(sum(line_total_cents), 0) into v_items_subtotal
  from booking_items where booking_id = v_booking.id;

  update bookings
    set items_subtotal_cents = v_items_subtotal,
        total_cents = v_courts_subtotal + v_items_subtotal
  where id = v_booking.id
  returning * into v_booking;

  return v_booking;
end;
$$;

-- Guest lookup: "Manage my bookings" needs reference AND matching email.
-- SECURITY DEFINER so anonymous callers can retrieve exactly their own booking
-- without a policy that would expose the whole table.
create or replace function find_booking_by_reference(p_reference text, p_email citext)
returns bookings
language sql
security definer
set search_path = public
stable
as $$
  select *
  from bookings
  where upper(reference) = upper(p_reference)
    and contact_email = p_email
  limit 1;
$$;

revoke all on function create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb) from public;
grant execute on function create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb)
  to anon, authenticated;

revoke all on function find_booking_by_reference(text, citext) from public;
grant execute on function find_booking_by_reference(text, citext) to anon, authenticated;

-- ===== supabase/migrations/20260101000500_rls.sql =====
-- Row level security. Default posture: deny. Catalog data is publicly readable
-- because the booking flow is guest-first; everything else is staff-only, with
-- customers reaching their own bookings through find_booking_by_reference().

alter table clubs enable row level security;
alter table courts enable row level security;
alter table pricing_rules enable row level security;
alter table availability_blocks enable row level security;
alter table products enable row level security;
alter table staff enable row level security;
alter table customers enable row level security;
alter table bookings enable row level security;
alter table booking_courts enable row level security;
alter table booking_items enable row level security;
alter table payments enable row level security;

-- Catalog: readable by anyone, writable by staff.

create policy clubs_public_read on clubs
  for select using (true);

create policy clubs_staff_write on clubs
  for all using (is_club_admin(id)) with check (is_club_admin(id));

create policy courts_public_read on courts
  for select using (is_active or is_staff(club_id));

create policy courts_staff_write on courts
  for all using (is_staff(club_id)) with check (is_staff(club_id));

create policy products_public_read on products
  for select using (is_active or is_staff(club_id));

create policy products_staff_write on products
  for all using (is_staff(club_id)) with check (is_staff(club_id));

-- Pricing rules drive quoted prices, so the public may read the active set.
create policy pricing_rules_public_read on pricing_rules
  for select using (is_active or is_staff(club_id));

create policy pricing_rules_staff_write on pricing_rules
  for all using (is_staff(club_id)) with check (is_staff(club_id));

-- Availability blocks must be visible publicly or the calendar would offer
-- slots that cannot be booked. Only the window is exposed, never the reason
-- text — that is filtered in the query layer for non-staff callers.
create policy availability_blocks_public_read on availability_blocks
  for select using (true);

create policy availability_blocks_staff_write on availability_blocks
  for all
  using (exists (select 1 from courts c where c.id = court_id and is_staff(c.club_id)))
  with check (exists (select 1 from courts c where c.id = court_id and is_staff(c.club_id)));

-- Staff directory: a member may read their own row; admins manage the club's.

create policy staff_self_read on staff
  for select using (user_id = auth.uid() or is_club_admin(club_id));

create policy staff_admin_write on staff
  for all using (is_club_admin(club_id)) with check (is_club_admin(club_id));

-- Customers: own record via linked auth user, otherwise staff only.

create policy customers_self_read on customers
  for select using (auth_user_id = auth.uid() or is_staff(club_id));

create policy customers_staff_write on customers
  for all using (is_staff(club_id)) with check (is_staff(club_id));

-- Bookings: no anonymous SELECT policy by design. Guests read their booking
-- through find_booking_by_reference(), which requires reference + email.

create policy bookings_owner_read on bookings
  for select using (
    is_staff(club_id)
    or exists (
      select 1 from customers c
      where c.id = bookings.customer_id and c.auth_user_id = auth.uid()
    )
  );

create policy bookings_staff_write on bookings
  for all using (is_staff(club_id)) with check (is_staff(club_id));

create policy booking_courts_owner_read on booking_courts
  for select using (
    exists (select 1 from bookings b where b.id = booking_id and (
      is_staff(b.club_id)
      or exists (
        select 1 from customers c
        where c.id = b.customer_id and c.auth_user_id = auth.uid()
      )
    ))
  );

create policy booking_courts_staff_write on booking_courts
  for all
  using (exists (select 1 from bookings b where b.id = booking_id and is_staff(b.club_id)))
  with check (exists (select 1 from bookings b where b.id = booking_id and is_staff(b.club_id)));

create policy booking_items_owner_read on booking_items
  for select using (
    exists (select 1 from bookings b where b.id = booking_id and (
      is_staff(b.club_id)
      or exists (
        select 1 from customers c
        where c.id = b.customer_id and c.auth_user_id = auth.uid()
      )
    ))
  );

create policy booking_items_staff_write on booking_items
  for all
  using (exists (select 1 from bookings b where b.id = booking_id and is_staff(b.club_id)))
  with check (exists (select 1 from bookings b where b.id = booking_id and is_staff(b.club_id)));

-- Payments are staff-only in both directions; customers see totals on the booking.
create policy payments_staff_all on payments
  for all
  using (exists (select 1 from bookings b where b.id = booking_id and is_staff(b.club_id)))
  with check (exists (select 1 from bookings b where b.id = booking_id and is_staff(b.club_id)));

-- ===== supabase/migrations/20260101000600_harden_rpc.sql =====
-- Two defects found by verifying the schema against a live database.

-- 1. `returns bookings` yields ONE all-null composite row when nothing matches,
--    so a caller checking "did I get a row?" saw a hit for a wrong email.
--    `returns setof bookings` returns zero rows, which is what callers expect.
drop function if exists find_booking_by_reference(text, citext);

create function find_booking_by_reference(p_reference text, p_email citext)
returns setof bookings
language sql
security definer
set search_path = public
stable
as $$
  select *
  from bookings
  where upper(reference) = upper(p_reference)
    and contact_email = p_email
  limit 1;
$$;

-- 2. create_booking is SECURITY DEFINER and accepts per-segment price_cents.
--    Granting it to `anon` let any client call it through PostgREST and name
--    its own price. Both RPCs are now reachable only by the service role, i.e.
--    only through a server action that validates input and prices the segments
--    with src/lib/domain/pricing.ts.
revoke all on function create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb)
  to service_role;

revoke all on function find_booking_by_reference(text, citext) from public, anon, authenticated;
grant execute on function find_booking_by_reference(text, citext) to service_role;

-- ===== supabase/migrations/20260102000000_booking_lifecycle.sql =====
-- Booking lifecycle: cancel, reschedule, and recording how a booking will be paid.
--
-- All three are SECURITY DEFINER and granted to service_role only, for the same
-- reason as create_booking: they accept per-segment prices, or authenticate by
-- reference + email, and neither may be driven from the browser.

-- ---------------------------------------------------------------------------
-- create_booking gains p_payment_method, so checkout records the intended
-- payment in the same transaction as the booking. Recreated rather than
-- overloaded: two live signatures would leave the old, weaker one callable.
-- ---------------------------------------------------------------------------

drop function if exists create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb);

create function create_booking(
  p_club_id uuid,
  p_contact_name text,
  p_contact_email citext,
  p_contact_phone text,
  p_will_present_id boolean,
  p_notes text,
  p_courts jsonb,
  p_items jsonb default '[]'::jsonb,
  p_payment_method payment_method default null
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_customer_id uuid;
  v_reference text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_courts_subtotal integer := 0;
  v_items_subtotal integer := 0;
begin
  if jsonb_array_length(p_courts) = 0 then
    raise exception 'a booking needs at least one court segment';
  end if;

  select min((c ->> 'starts_at')::timestamptz), max((c ->> 'ends_at')::timestamptz)
    into v_starts_at, v_ends_at
  from jsonb_array_elements(p_courts) as c;

  select coalesce(sum((c ->> 'price_cents')::integer), 0)
    into v_courts_subtotal
  from jsonb_array_elements(p_courts) as c;

  insert into customers (club_id, full_name, email, phone)
  values (p_club_id, p_contact_name, p_contact_email, p_contact_phone)
  on conflict (club_id, email) do update
    set full_name = excluded.full_name,
        phone = coalesce(excluded.phone, customers.phone)
  returning id into v_customer_id;

  v_reference := generate_booking_reference();

  insert into bookings (
    club_id, reference, customer_id, contact_name, contact_email, contact_phone,
    status, starts_at, ends_at, courts_subtotal_cents, will_present_id, notes
  )
  values (
    p_club_id, v_reference, v_customer_id, p_contact_name, p_contact_email, p_contact_phone,
    'awaiting_payment', v_starts_at, v_ends_at, v_courts_subtotal, p_will_present_id, p_notes
  )
  returning * into v_booking;

  insert into booking_courts (booking_id, court_id, status, starts_at, ends_at, price_cents)
  select
    v_booking.id,
    (c ->> 'court_id')::uuid,
    v_booking.status,
    (c ->> 'starts_at')::timestamptz,
    (c ->> 'ends_at')::timestamptz,
    (c ->> 'price_cents')::integer
  from jsonb_array_elements(p_courts) as c;

  -- Prices come from the catalog, never from the caller.
  insert into booking_items (booking_id, product_id, name_snapshot, unit_price_cents, quantity)
  select
    v_booking.id,
    p.id,
    p.name,
    p.price_cents,
    greatest((i ->> 'quantity')::smallint, 1)
  from jsonb_array_elements(p_items) as i
  join products p
    on p.id = (i ->> 'product_id')::uuid
   and p.club_id = p_club_id
   and p.is_active;

  select coalesce(sum(line_total_cents), 0) into v_items_subtotal
  from booking_items where booking_id = v_booking.id;

  update bookings
    set items_subtotal_cents = v_items_subtotal,
        total_cents = v_courts_subtotal + v_items_subtotal
  where id = v_booking.id
  returning * into v_booking;

  -- An intent to pay, not a settlement: staff mark it paid from the admin
  -- Orders screen, which is what stamps paid_at.
  if p_payment_method is not null then
    insert into payments (booking_id, method, status, amount_cents)
    values (v_booking.id, p_payment_method, 'pending', v_booking.total_cents);
  end if;

  return v_booking;
end;
$$;

revoke all on function create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb, payment_method)
  from public, anon, authenticated;
grant execute on function create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb, payment_method)
  to service_role;

-- ---------------------------------------------------------------------------
-- Guest cancellation. Authenticated by reference + email, the same pair the
-- lookup uses. Setting bookings.status fires bookings_sync_court_status, which
-- flips booking_courts.status and so releases the exclusion constraint.
-- ---------------------------------------------------------------------------

create function cancel_booking(p_reference text, p_email citext)
returns setof bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
begin
  select * into v_booking
  from bookings
  where upper(reference) = upper(p_reference)
    and contact_email = p_email
  for update;

  if not found then
    return;
  end if;

  -- A session already played, or already cancelled, is not cancellable.
  if v_booking.status in ('cancelled', 'completed') then
    raise exception 'booking % cannot be cancelled from status %',
      v_booking.reference, v_booking.status
      using errcode = 'P0002';
  end if;

  return query
    update bookings
      set status = 'cancelled',
          cancelled_at = now()
    where id = v_booking.id
    returning *;
end;
$$;

revoke all on function cancel_booking(text, citext) from public, anon, authenticated;
grant execute on function cancel_booking(text, citext) to service_role;

-- ---------------------------------------------------------------------------
-- Guest reschedule. Replaces every segment in one transaction: the old rows are
-- deleted and the new ones inserted, so the exclusion constraint sees the final
-- state. A clash raises 23P01 and the whole reschedule rolls back — the booking
-- keeps its original slot rather than losing it to a half-applied move.
-- ---------------------------------------------------------------------------

create function reschedule_booking(p_reference text, p_email citext, p_courts jsonb)
returns setof bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_courts_subtotal integer := 0;
begin
  if jsonb_array_length(p_courts) = 0 then
    raise exception 'a booking needs at least one court segment';
  end if;

  select * into v_booking
  from bookings
  where upper(reference) = upper(p_reference)
    and contact_email = p_email
  for update;

  if not found then
    return;
  end if;

  if v_booking.status in ('cancelled', 'completed') then
    raise exception 'booking % cannot be rescheduled from status %',
      v_booking.reference, v_booking.status
      using errcode = 'P0002';
  end if;

  select min((c ->> 'starts_at')::timestamptz), max((c ->> 'ends_at')::timestamptz)
    into v_starts_at, v_ends_at
  from jsonb_array_elements(p_courts) as c;

  select coalesce(sum((c ->> 'price_cents')::integer), 0)
    into v_courts_subtotal
  from jsonb_array_elements(p_courts) as c;

  delete from booking_courts where booking_id = v_booking.id;

  insert into booking_courts (booking_id, court_id, status, starts_at, ends_at, price_cents)
  select
    v_booking.id,
    (c ->> 'court_id')::uuid,
    v_booking.status,
    (c ->> 'starts_at')::timestamptz,
    (c ->> 'ends_at')::timestamptz,
    (c ->> 'price_cents')::integer
  from jsonb_array_elements(p_courts) as c;

  return query
    update bookings
      set starts_at = v_starts_at,
          ends_at = v_ends_at,
          courts_subtotal_cents = v_courts_subtotal,
          total_cents = v_courts_subtotal + items_subtotal_cents
    where id = v_booking.id
    returning *;
end;
$$;

revoke all on function reschedule_booking(text, citext, jsonb) from public, anon, authenticated;
grant execute on function reschedule_booking(text, citext, jsonb) to service_role;

-- ===== supabase/migrations/20260102000100_customer_rollups.sql =====
-- Customer rollups.
--
-- customers.total_spend_cents, bookings_count and last_visit_at back the admin
-- Customers screen and the membership tiers the pricing engine reads. Nothing
-- was writing them, so every customer read as a zero-spend first-timer.
--
-- Recomputed from the bookings table rather than incremented, so the counters
-- cannot drift when a booking is cancelled, rescheduled, or repriced.

create or replace function refresh_customer_rollups(p_customer_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update customers c
    set total_spend_cents = coalesce(agg.spend, 0),
        bookings_count = coalesce(agg.count, 0),
        last_visit_at = agg.last_visit
  from (
    select
      sum(total_cents) filter (where status in ('confirmed', 'completed')) as spend,
      count(*) filter (where status in ('confirmed', 'completed')) as count,
      max(starts_at) filter (where status = 'completed') as last_visit
    from bookings
    where customer_id = p_customer_id
  ) as agg
  where c.id = p_customer_id;
$$;

create or replace function sync_customer_rollups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  -- NEW is unassigned on DELETE and OLD is unassigned on INSERT, so neither can
  -- be referenced unconditionally.
  if tg_op = 'DELETE' then
    v_customer_id := old.customer_id;
  else
    v_customer_id := new.customer_id;

    -- On update the booking can move to a different customer; refresh both.
    if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
      perform refresh_customer_rollups(old.customer_id);
    end if;
  end if;

  perform refresh_customer_rollups(v_customer_id);

  return null;
end;
$$;

create trigger bookings_sync_customer_rollups
  after insert or update of status, total_cents, customer_id or delete on bookings
  for each row execute function sync_customer_rollups();

-- Backfill anything that existed before this trigger.
select refresh_customer_rollups(id) from customers;

-- ===== supabase/migrations/20260102000200_reporting.sql =====
-- Reporting for the admin Reports screen.
--
-- Aggregated in SQL rather than in the application: the alternative is pulling
-- every booking of the period into Node just to sum it. Read-only and scoped to
-- staff of the club by an is_staff() check, so RLS on the underlying tables is
-- not silently bypassed by SECURITY DEFINER.

-- Revenue and session count per court over a window.
create or replace function report_court_revenue(
  p_club_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  court_id uuid,
  court_name text,
  sessions bigint,
  booked_minutes bigint,
  revenue_cents bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    c.name,
    count(bc.id),
    coalesce(sum(extract(epoch from (bc.ends_at - bc.starts_at)) / 60), 0)::bigint,
    coalesce(sum(bc.price_cents), 0)::bigint
  from courts c
  left join booking_courts bc
    on bc.court_id = c.id
   and bc.status in ('confirmed', 'completed')
   and bc.starts_at < p_to
   and bc.ends_at > p_from
  where c.club_id = p_club_id
    and is_staff(p_club_id)
  group by c.id, c.name
  order by c.sort_order;
$$;

-- Headline tiles: revenue, bookings, add-on sales, and utilisation for a window.
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
  -- Sellable minutes = open hours per day x active courts, the denominator for
  -- the utilisation bars.
  capacity as (
    select
      (select count(*) from courts where club_id = p_club_id and is_active) *
      (select extract(epoch from (closes_at - opens_at)) / 60 from clubs where id = p_club_id) *
      greatest(ceil(extract(epoch from (p_to - p_from)) / 86400), 1) as minutes
  )
  select
    (select count(*) from scoped),
    coalesce((select sum(courts_subtotal_cents) from scoped), 0)::bigint,
    coalesce((select sum(items_subtotal_cents) from scoped), 0)::bigint,
    coalesce((
      select sum(extract(epoch from (bc.ends_at - bc.starts_at)) / 60)
      from booking_courts bc
      join scoped s on s.id = bc.booking_id
    ), 0)::bigint,
    (select minutes from capacity)::bigint
  where is_staff(p_club_id);
$$;

-- Best-selling add-ons and café items over a window.
create or replace function report_product_sales(
  p_club_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  name text,
  units bigint,
  revenue_cents bigint
)
language sql
security definer
set search_path = public
stable
as $$
  select
    bi.name_snapshot,
    sum(bi.quantity)::bigint,
    sum(bi.line_total_cents)::bigint
  from booking_items bi
  join bookings b on b.id = bi.booking_id
  where b.club_id = p_club_id
    and b.status in ('confirmed', 'completed')
    and b.starts_at < p_to
    and b.ends_at > p_from
    and is_staff(p_club_id)
  group by bi.name_snapshot
  order by 3 desc;
$$;

revoke all on function report_court_revenue(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function report_club_totals(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function report_product_sales(uuid, timestamptz, timestamptz) from public, anon;

grant execute on function report_court_revenue(uuid, timestamptz, timestamptz)
  to authenticated, service_role;
grant execute on function report_club_totals(uuid, timestamptz, timestamptz)
  to authenticated, service_role;
grant execute on function report_product_sales(uuid, timestamptz, timestamptz)
  to authenticated, service_role;

-- ===== supabase/migrations/20260102000300_lookup_rate_limit.sql =====
-- Rate limit for guest booking lookup.
--
-- find_booking_by_reference is enumerable given a valid reference: the action
-- returns an identical message for a wrong reference and a wrong email, which
-- stops it confirming that a reference exists, but nothing stopped a caller
-- from grinding through the keyspace. This bounds attempts per identity.

create table booking_lookup_attempts (
  id bigserial primary key,
  -- Whatever the caller is identified by: email, or a hashed client address.
  identity text not null,
  attempted_at timestamptz not null default now()
);

create index booking_lookup_attempts_identity_idx
  on booking_lookup_attempts (identity, attempted_at desc);

alter table booking_lookup_attempts enable row level security;
-- No policy: only service_role, which bypasses RLS, may touch this table.

/*
 * Records an attempt and reports whether the caller is still under the limit.
 * Returns false once the window is exhausted, so the caller refuses the lookup.
 * The attempt is recorded either way — otherwise a blocked caller would decay
 * back under the limit while still hammering the endpoint.
 */
create or replace function record_lookup_attempt(
  p_identity text,
  p_limit integer default 10,
  p_window interval default interval '15 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer;
begin
  insert into booking_lookup_attempts (identity) values (p_identity);

  select count(*) into v_recent
  from booking_lookup_attempts
  where identity = p_identity
    and attempted_at > now() - p_window;

  -- Opportunistic cleanup so the table cannot grow without bound.
  delete from booking_lookup_attempts
  where attempted_at < now() - interval '1 day';

  return v_recent <= p_limit;
end;
$$;

revoke all on function record_lookup_attempt(text, integer, interval) from public, anon, authenticated;
grant execute on function record_lookup_attempt(text, integer, interval) to service_role;

-- ===== supabase/migrations/20260103000000_court_detail.sql =====
-- Backs the court detail page redesign.
--
-- Three shape changes, all driven by what the design renders and the schema
-- could not previously supply:
--
--   1. "Good to know" is a list of separate lines, not one paragraph, so
--      courts.notes becomes text[] alongside the existing tags/includes arrays.
--   2. The booking sidebar shows a desk phone, a cancellation window, and a
--      group-booking note. Those are club policy, so they live on clubs rather
--      than being hardcoded in the page.
--   3. The duration picker offers 30 minute sessions, which the previous
--      60 minute floor would have rejected in getAvailability.

-- 1. Notes: scalar text -> text[].
-- Existing single notes become one-element arrays so no copy is lost.
alter table courts
  alter column notes drop default,
  alter column notes type text[]
    using case
      when notes is null or btrim(notes) = '' then '{}'::text[]
      else array[notes]
    end;

alter table courts
  alter column notes set default '{}',
  alter column notes set not null;

comment on column courts.notes is
  'One "Good to know" line per element. Rendered as a list on the court detail page.';

-- 2. Storefront policy copy the booking sidebar reads.
alter table clubs
  add column phone text,
  add column cancellation_window_hours smallint not null default 12,
  add column group_booking_note text;

alter table clubs
  add constraint clubs_cancellation_window_bounded
    check (cancellation_window_hours between 0 and 168);

comment on column clubs.cancellation_window_hours is
  'Hours before start that a booking can still be cancelled free. Shown under the booking CTA.';

-- 3. Allow 30 minute sessions. slot_minutes already defaults to 30, so the
-- slot grid needs no change — only the floor that availability validates.
alter table clubs
  alter column min_duration_minutes set default 30;

update clubs
  set min_duration_minutes = 30
  where min_duration_minutes = 60;

-- ===== supabase/migrations/20260104000000_checkout.sql =====
-- Guest checkout: how a club says it wants to be paid, and how a guest proves
-- they paid.
--
-- The club settles manually (GCash, bank transfer, cash at the desk), so the
-- two things missing were a place to publish the account details and a place to
-- keep the screenshot the desk verifies against.

-- ---------------------------------------------------------------------------
-- Publishable payment instructions, one row per method a club accepts.
--
-- Separate from the `payment_method` enum rather than replacing it: the enum is
-- the settlement channel a payment lands in and is referenced by `payments`,
-- while these rows are editable copy — a club may accept GCash on two numbers,
-- or rename "Cash" to "Pay at the desk", without a migration.
-- ---------------------------------------------------------------------------
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs (id) on delete cascade,
  method payment_method not null,
  label text not null,
  -- Account holder and number as the guest must type them into their wallet.
  account_name text,
  account_number text,
  instructions text,
  qr_image_url text,
  -- Whether checkout must carry a screenshot. False for pay-at-the-desk, where
  -- there is nothing to screenshot yet.
  requires_proof boolean not null default false,
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_methods_club_idx on payment_methods (club_id, sort_order) where is_active;

create trigger payment_methods_set_updated_at
  before update on payment_methods
  for each row execute function set_updated_at();

alter table payment_methods enable row level security;

-- Instructions are meant to be read by anyone about to pay; only staff edit them.
create policy payment_methods_public_read on payment_methods
  for select
  to anon, authenticated
  using (is_active);

create policy payment_methods_staff_write on payment_methods
  for all
  to authenticated
  using (is_club_admin(club_id))
  with check (is_club_admin(club_id));

-- ---------------------------------------------------------------------------
-- The proof itself. An ImageKit file path, not a URL: the file is uploaded
-- private, so the desk views it through a signed link that expires rather than
-- a guessable permanent one.
--
-- Images live in ImageKit rather than Supabase Storage, so there is no bucket
-- to create here. Uploads go through the checkout server action, which has
-- already validated the file's type and size — a store a browser can write to
-- directly is an open file drop.
-- ---------------------------------------------------------------------------
alter table payments add column proof_url text;

-- ===== supabase/migrations/20260105000000_court_capacity.sql =====
-- Court capacity and booking party size ("pax").
--
-- A court has always had a physical limit on how many people can play on it;
-- until now that lived only in the blurb copy. Making it a column lets the
-- booking flow bound what a guest can pick, and lets the desk see at a glance
-- whether a 6-person group fits on the court they booked.
--
-- Capacity does not affect price. A court is sold by the slot, not by the head,
-- so pricing_rules is untouched.

alter table courts
  add column min_players smallint not null default 2,
  add column max_players smallint not null default 4;

alter table courts
  add constraint courts_players_ordered check (max_players >= min_players),
  add constraint courts_players_positive check (min_players > 0);

-- Nullable on purpose: bookings taken before this migration have no recorded
-- party size, and inventing one would be a lie the desk might act on. The
-- admin screens render those as "—".
alter table bookings
  add column party_size smallint,
  add constraint bookings_party_size_positive check (party_size is null or party_size > 0);

-- ---------------------------------------------------------------------------
-- create_booking carries the party size through.
--
-- Recreated rather than overloaded, for the same reason 20260102000000 dropped
-- the previous signature: two live signatures would leave the older, weaker one
-- callable, and a caller that omitted the new argument would silently bind to
-- it. p_party_size defaults to null so the shape stays additive for anything
-- mid-flight during deploy.
--
-- The value is validated against the court's own min/max here rather than by a
-- check constraint, because the bound lives on a different table. Doing it in
-- the same transaction that inserts the segments means a party that does not
-- fit can never be recorded — the whole booking rolls back.
-- ---------------------------------------------------------------------------

drop function if exists create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb, payment_method);

create function create_booking(
  p_club_id uuid,
  p_contact_name text,
  p_contact_email citext,
  p_contact_phone text,
  p_will_present_id boolean,
  p_notes text,
  p_courts jsonb,
  p_items jsonb default '[]'::jsonb,
  p_payment_method payment_method default null,
  p_party_size smallint default null
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_customer_id uuid;
  v_reference text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_courts_subtotal integer := 0;
  v_items_subtotal integer := 0;
  v_min_players smallint;
  v_max_players smallint;
begin
  if jsonb_array_length(p_courts) = 0 then
    raise exception 'a booking needs at least one court segment';
  end if;

  -- The widest band the chosen courts allow. A booking spanning two courts can
  -- seat as many as the roomier one, and needs at least as many as the emptier
  -- one asks for.
  if p_party_size is not null then
    select min(c.min_players), max(c.max_players)
      into v_min_players, v_max_players
    from courts c
    where c.id in (
      select (seg ->> 'court_id')::uuid from jsonb_array_elements(p_courts) as seg
    );

    if p_party_size < v_min_players or p_party_size > v_max_players then
      raise exception 'party size % is outside the % to % this court seats',
        p_party_size, v_min_players, v_max_players
        using errcode = 'check_violation';
    end if;
  end if;

  select min((c ->> 'starts_at')::timestamptz), max((c ->> 'ends_at')::timestamptz)
    into v_starts_at, v_ends_at
  from jsonb_array_elements(p_courts) as c;

  select coalesce(sum((c ->> 'price_cents')::integer), 0)
    into v_courts_subtotal
  from jsonb_array_elements(p_courts) as c;

  insert into customers (club_id, full_name, email, phone)
  values (p_club_id, p_contact_name, p_contact_email, p_contact_phone)
  on conflict (club_id, email) do update
    set full_name = excluded.full_name,
        phone = coalesce(excluded.phone, customers.phone)
  returning id into v_customer_id;

  v_reference := generate_booking_reference();

  insert into bookings (
    club_id, reference, customer_id, contact_name, contact_email, contact_phone,
    status, starts_at, ends_at, courts_subtotal_cents, will_present_id, notes, party_size
  )
  values (
    p_club_id, v_reference, v_customer_id, p_contact_name, p_contact_email, p_contact_phone,
    'awaiting_payment', v_starts_at, v_ends_at, v_courts_subtotal, p_will_present_id, p_notes,
    p_party_size
  )
  returning * into v_booking;

  insert into booking_courts (booking_id, court_id, status, starts_at, ends_at, price_cents)
  select
    v_booking.id,
    (c ->> 'court_id')::uuid,
    v_booking.status,
    (c ->> 'starts_at')::timestamptz,
    (c ->> 'ends_at')::timestamptz,
    (c ->> 'price_cents')::integer
  from jsonb_array_elements(p_courts) as c;

  -- Prices come from the catalog, never from the caller.
  insert into booking_items (booking_id, product_id, name_snapshot, unit_price_cents, quantity)
  select
    v_booking.id,
    p.id,
    p.name,
    p.price_cents,
    greatest((i ->> 'quantity')::smallint, 1)
  from jsonb_array_elements(p_items) as i
  join products p
    on p.id = (i ->> 'product_id')::uuid
   and p.club_id = p_club_id
   and p.is_active;

  select coalesce(sum(line_total_cents), 0) into v_items_subtotal
  from booking_items where booking_id = v_booking.id;

  update bookings
    set items_subtotal_cents = v_items_subtotal,
        total_cents = v_courts_subtotal + v_items_subtotal
  where id = v_booking.id
  returning * into v_booking;

  -- An intent to pay, not a settlement: staff mark it paid from the admin
  -- Orders screen, which is what stamps paid_at.
  if p_payment_method is not null then
    insert into payments (booking_id, method, status, amount_cents)
    values (v_booking.id, p_payment_method, 'pending', v_booking.total_cents);
  end if;

  return v_booking;
end;
$$;

revoke all on function
  create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb, payment_method, smallint)
  from public, anon, authenticated;
grant execute on function
  create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb, payment_method, smallint)
  to service_role;

-- ===== supabase/migrations/20260106000000_pax_pricing_and_players.sql =====
-- Who is playing, and what the extra heads cost.
--
-- 20260105000000 gave courts a min/max capacity and bookings a party_size, but
-- nothing wrote the party size and nothing charged for it. Two things change
-- here:
--
--   1. The slot price now covers a stated number of players. Beyond that the
--      club charges per head, up to the max the court already seats. A court is
--      still sold by the slot; the fee prices the wear of a fuller court, not
--      the time.
--   2. The booker names every player. The desk needs the names on the day, and
--      counting them is how the party size stops being a number a guest can
--      assert independently of who actually turns up.

-- ---------------------------------------------------------------------------
-- Court capacity gains a covered count and a per-head fee.
-- ---------------------------------------------------------------------------

alter table courts
  add column included_players smallint,
  add column extra_player_fee_cents integer not null default 0;

-- Existing courts sold their whole capacity for the slot price, and changing
-- that silently would re-price live inventory. Every court starts with its full
-- max covered and a zero fee, so this migration is a no-op on price until a
-- staff member decides otherwise.
update courts set included_players = max_players where included_players is null;

alter table courts
  alter column included_players set not null,
  alter column included_players set default 4;

alter table courts
  add constraint courts_included_within_capacity
    check (included_players >= min_players and included_players <= max_players),
  add constraint courts_extra_fee_not_negative
    check (extra_player_fee_cents >= 0);

-- ---------------------------------------------------------------------------
-- The extra-player charge on a booking.
--
-- Its own column rather than folded into courts_subtotal_cents: the orders
-- screen shows it as its own line, and a total a guest cannot decompose is a
-- total the desk cannot defend on the phone.
-- ---------------------------------------------------------------------------

alter table bookings
  add column extra_players_fee_cents integer not null default 0,
  add constraint bookings_extra_players_fee_not_negative
    check (extra_players_fee_cents >= 0);

-- ---------------------------------------------------------------------------
-- Who is playing.
--
-- Rows rather than a jsonb array: the desk reads these one at a time, and
-- `position` gives the booker a stable order to edit against. Cascade on delete
-- because a player has no meaning apart from the booking that names them.
-- ---------------------------------------------------------------------------

create table booking_players (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  position smallint not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint booking_players_position_positive check (position > 0),
  constraint booking_players_name_not_blank check (length(btrim(name)) > 0),
  unique (booking_id, position)
);

create index booking_players_booking_idx on booking_players (booking_id);

alter table booking_players enable row level security;

-- Same reach as booking_items: staff at the club, or the customer who owns the
-- booking.
create policy booking_players_owner_read on booking_players
  for select using (
    exists (select 1 from bookings b where b.id = booking_id and (
      is_staff(b.club_id)
      or exists (
        select 1 from customers c
        where c.id = b.customer_id and c.auth_user_id = auth.uid()
      )
    ))
  );

create policy booking_players_staff_write on booking_players
  for all
  using (exists (select 1 from bookings b where b.id = booking_id and is_staff(b.club_id)))
  with check (exists (select 1 from bookings b where b.id = booking_id and is_staff(b.club_id)));

-- ---------------------------------------------------------------------------
-- create_booking takes the players, and derives the party size from them.
--
-- Recreated rather than overloaded, for the reason 20260105000000 gave: two
-- live signatures leave the weaker one callable, and a caller that omitted the
-- new argument would silently bind to it.
--
-- p_party_size is gone. It was a number a caller asserted alongside a list it
-- did not have to agree with; counting p_players makes the two the same fact.
-- ---------------------------------------------------------------------------

drop function if exists create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb, payment_method, smallint);

create function create_booking(
  p_club_id uuid,
  p_contact_name text,
  p_contact_email citext,
  p_contact_phone text,
  p_will_present_id boolean,
  p_notes text,
  p_courts jsonb,
  p_items jsonb default '[]'::jsonb,
  p_payment_method payment_method default null,
  p_players jsonb default '[]'::jsonb
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking bookings;
  v_customer_id uuid;
  v_reference text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_courts_subtotal integer := 0;
  v_items_subtotal integer := 0;
  v_party_size smallint;
  v_min_players smallint;
  v_max_players smallint;
  v_included_players smallint;
  v_extra_fee_cents integer;
  v_extra_players_fee integer := 0;
begin
  if jsonb_array_length(p_courts) = 0 then
    raise exception 'a booking needs at least one court segment';
  end if;

  v_party_size := nullif(jsonb_array_length(p_players), 0);

  -- The seating terms across every court booked. Capacity spans the widest
  -- band, as before; where the courts disagree on price the guest gets the
  -- better of the two, so adding a court can never raise the per-head cost.
  if v_party_size is not null then
    select
      min(c.min_players), max(c.max_players),
      max(c.included_players), min(c.extra_player_fee_cents)
      into v_min_players, v_max_players, v_included_players, v_extra_fee_cents
    from courts c
    where c.id in (
      select (seg ->> 'court_id')::uuid from jsonb_array_elements(p_courts) as seg
    );

    if v_party_size < v_min_players or v_party_size > v_max_players then
      raise exception 'party size % is outside the % to % this court seats',
        v_party_size, v_min_players, v_max_players
        using errcode = 'check_violation';
    end if;

    v_extra_players_fee :=
      greatest(0, v_party_size - v_included_players) * v_extra_fee_cents;
  end if;

  select min((c ->> 'starts_at')::timestamptz), max((c ->> 'ends_at')::timestamptz)
    into v_starts_at, v_ends_at
  from jsonb_array_elements(p_courts) as c;

  select coalesce(sum((c ->> 'price_cents')::integer), 0)
    into v_courts_subtotal
  from jsonb_array_elements(p_courts) as c;

  insert into customers (club_id, full_name, email, phone)
  values (p_club_id, p_contact_name, p_contact_email, p_contact_phone)
  on conflict (club_id, email) do update
    set full_name = excluded.full_name,
        phone = coalesce(excluded.phone, customers.phone)
  returning id into v_customer_id;

  v_reference := generate_booking_reference();

  insert into bookings (
    club_id, reference, customer_id, contact_name, contact_email, contact_phone,
    status, starts_at, ends_at, courts_subtotal_cents, will_present_id, notes,
    party_size, extra_players_fee_cents
  )
  values (
    p_club_id, v_reference, v_customer_id, p_contact_name, p_contact_email, p_contact_phone,
    'awaiting_payment', v_starts_at, v_ends_at, v_courts_subtotal, p_will_present_id, p_notes,
    v_party_size, v_extra_players_fee
  )
  returning * into v_booking;

  insert into booking_courts (booking_id, court_id, status, starts_at, ends_at, price_cents)
  select
    v_booking.id,
    (c ->> 'court_id')::uuid,
    v_booking.status,
    (c ->> 'starts_at')::timestamptz,
    (c ->> 'ends_at')::timestamptz,
    (c ->> 'price_cents')::integer
  from jsonb_array_elements(p_courts) as c;

  -- Names in the order the booker entered them. btrim here rather than trusting
  -- the caller, because the not-blank constraint is the last line of defence.
  insert into booking_players (booking_id, position, name)
  select
    v_booking.id,
    player.ordinality::smallint,
    btrim(player.value #>> '{}')
  from jsonb_array_elements(p_players) with ordinality as player(value, ordinality);

  -- Prices come from the catalog, never from the caller.
  insert into booking_items (booking_id, product_id, name_snapshot, unit_price_cents, quantity)
  select
    v_booking.id,
    p.id,
    p.name,
    p.price_cents,
    greatest((i ->> 'quantity')::smallint, 1)
  from jsonb_array_elements(p_items) as i
  join products p
    on p.id = (i ->> 'product_id')::uuid
   and p.club_id = p_club_id
   and p.is_active;

  select coalesce(sum(line_total_cents), 0) into v_items_subtotal
  from booking_items where booking_id = v_booking.id;

  update bookings
    set items_subtotal_cents = v_items_subtotal,
        total_cents = v_courts_subtotal + v_items_subtotal + v_extra_players_fee
  where id = v_booking.id
  returning * into v_booking;

  -- An intent to pay, not a settlement: staff mark it paid from the admin
  -- Orders screen, which is what stamps paid_at.
  if p_payment_method is not null then
    insert into payments (booking_id, method, status, amount_cents)
    values (v_booking.id, p_payment_method, 'pending', v_booking.total_cents);
  end if;

  return v_booking;
end;
$$;

revoke all on function
  create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb, payment_method, jsonb)
  from public, anon, authenticated;
grant execute on function
  create_booking(uuid, text, citext, text, boolean, text, jsonb, jsonb, payment_method, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Reporting counts the extra-player fee as court revenue.
--
-- Folded into courts_revenue_cents rather than returned as a sixth column: the
-- fee is charged for occupying the court, so it belongs with the court money,
-- and widening the return shape would break every existing caller.
--
-- report_court_revenue is deliberately left alone. It attributes money to a
-- named court from booking_courts.price_cents, and a party fee on a booking
-- spanning two courts belongs to neither of them.
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
      (select extract(epoch from (closes_at - opens_at)) / 60 from clubs where id = p_club_id) *
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

-- ===== supabase/migrations/20260813000000_payment_method_management.sql =====
-- Staff-facing payment method management and atomic checkout ordering.

drop policy if exists payment_methods_staff_write on payment_methods;

create policy payment_methods_staff_write on payment_methods
  for all
  to authenticated
  using (is_staff(club_id))
  with check (is_staff(club_id));

create or replace function move_payment_method(
  p_method_id uuid,
  p_direction text
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_method payment_methods%rowtype;
  v_neighbor payment_methods%rowtype;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Direction must be up or down' using errcode = '22023';
  end if;

  select * into v_method
  from payment_methods
  where id = p_method_id;

  if not found then
    raise exception 'Payment method not found' using errcode = 'P0002';
  end if;

  if p_direction = 'up' then
    select * into v_neighbor
    from payment_methods
    where club_id = v_method.club_id
      and (sort_order, id) < (v_method.sort_order, v_method.id)
    order by sort_order desc, id desc
    limit 1;
  else
    select * into v_neighbor
    from payment_methods
    where club_id = v_method.club_id
      and (sort_order, id) > (v_method.sort_order, v_method.id)
    order by sort_order asc, id asc
    limit 1;
  end if;

  if not found then
    return;
  end if;

  update payment_methods
  set sort_order = case id
    when v_method.id then v_neighbor.sort_order
    when v_neighbor.id then v_method.sort_order
  end
  where id in (v_method.id, v_neighbor.id);
end;
$$;

revoke all on function move_payment_method(uuid, text) from public, anon;
grant execute on function move_payment_method(uuid, text) to authenticated;

create or replace function set_payment_method_active(
  p_method_id uuid,
  p_is_active boolean,
  p_acknowledge_checkout_pause boolean default false
)
returns payment_methods
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_method payment_methods%rowtype;
  v_active_count integer;
begin
  select * into v_method
  from payment_methods
  where id = p_method_id;

  if not found then
    raise exception 'Payment method not found' using errcode = 'P0002';
  end if;

  -- Serialize status changes for this club before counting active rows.
  perform id
  from payment_methods
  where club_id = v_method.club_id
  for update;

  if v_method.is_active and not p_is_active and not p_acknowledge_checkout_pause then
    select count(*) into v_active_count
    from payment_methods
    where club_id = v_method.club_id and is_active;

    if v_active_count <= 1 then
      raise exception 'Hiding this method would pause online checkout' using errcode = 'P0001';
    end if;
  end if;

  update payment_methods
  set is_active = p_is_active
  where id = p_method_id
  returning * into v_method;

  return v_method;
end;
$$;

revoke all on function set_payment_method_active(uuid, boolean, boolean) from public, anon;
grant execute on function set_payment_method_active(uuid, boolean, boolean) to authenticated;

-- ===== supabase/migrations/20261011000000_rename_club.sql =====
-- Rename the demo club to the real venue name. The admin console header reads
-- clubs.name, so this is the only place the name needs to change.
update clubs
  set name = 'HASSY PICKLEBALL COURT'
  where name = 'Baseline Pickleball Club';

-- ===== supabase/seed.sql =====
-- Demo data so the imported UI has something real to render.
-- Ids are fixed to keep local test fixtures stable across `supabase db reset`.

insert into clubs (
  id, name, slug, timezone, currency, opens_at, closes_at,
  min_duration_minutes, phone, cancellation_window_hours, group_booking_note
)
values (
  '00000000-0000-4000-8000-000000000001',
  'HASSY PICKLEBALL COURT',
  'baseline',
  'Asia/Manila',
  'PHP',
  '06:00',
  '22:00',
  30,
  '(555) 019-8842',
  12,
  'Book two adjacent courts and we will set up the divider net.'
);

insert into courts (
  club_id, name, slug, surface, environment, is_tournament_grade,
  blurb, notes, tags, includes, base_price_cents, sort_order
)
values
  ('00000000-0000-4000-8000-000000000001', 'Court 1 — Center', 'court-1',
   'Cushioned acrylic', 'indoor', true,
   'Our tournament-grade show court with tiered seating.',
   array['Non-marking shoes required', 'Court cameras available on request', 'Air conditioned year round'],
   array['Tournament', 'Seating', 'Air-conditioned'],
   array['Net and posts', 'Scoreboard', 'Towel service'],
   90000, 1),
  ('00000000-0000-4000-8000-000000000001', 'Court 2 — Center', 'court-2',
   'Cushioned acrylic', 'indoor', true,
   'Identical surface to Court 1, no seating tier.',
   array['Non-marking shoes required', 'Coaching can be added to any slot'],
   array['Tournament', 'Air-conditioned'],
   array['Net and posts', 'Scoreboard'],
   85000, 2),
  ('00000000-0000-4000-8000-000000000001', 'Court 3 — Garden', 'court-3',
   'Textured concrete', 'outdoor', false,
   'Open-air court shaded until mid-afternoon.',
   array['Play may pause during rain', 'Lights on automatically after 7pm'],
   array['Outdoor', 'Shaded'],
   array['Net and posts'],
   60000, 3),
  ('00000000-0000-4000-8000-000000000001', 'Court 4 — Garden', 'court-4',
   'Textured concrete', 'outdoor', false,
   'Open-air court beside the café terrace.',
   array['Play may pause during rain', 'Café orders can be delivered courtside'],
   array['Outdoor', 'Near café'],
   array['Net and posts'],
   60000, 4),
  ('00000000-0000-4000-8000-000000000001', 'Court 5 — Covered', 'court-5',
   'Sport tile', 'outdoor', false,
   'Roofed but open-sided — playable in light rain.',
   array['Playable in light rain', 'Open sided, so expect a breeze'],
   array['Covered', 'All-weather'],
   array['Net and posts', 'Bench seating'],
   70000, 5),
  ('00000000-0000-4000-8000-000000000001', 'Court 6 — Covered', 'court-6',
   'Sport tile', 'outdoor', false,
   'Our quietest court, furthest from the lobby.',
   array['Furthest court from the lobby — allow a few extra minutes'],
   array['Covered', 'Quiet'],
   array['Net and posts', 'Bench seating'],
   70000, 6);

insert into products (club_id, name, description, type, price_cents, has_quantity, sort_order)
values
  ('00000000-0000-4000-8000-000000000001', 'Paddle rental', 'Graphite paddle, per session', 'addon', 20000, true, 1),
  ('00000000-0000-4000-8000-000000000001', 'Ball tube (3)', 'Outdoor-rated balls', 'addon', 45000, true, 2),
  ('00000000-0000-4000-8000-000000000001', 'Ball machine', 'Includes setup, per hour', 'addon', 60000, false, 3),
  ('00000000-0000-4000-8000-000000000001', 'Coaching add-on', '30 minutes with a club pro', 'addon', 120000, false, 4),
  ('00000000-0000-4000-8000-000000000001', 'Cold brew', null, 'cafe', 15000, true, 5),
  ('00000000-0000-4000-8000-000000000001', 'Electrolyte bottle', null, 'cafe', 8000, true, 6),
  ('00000000-0000-4000-8000-000000000001', 'Protein bowl', null, 'cafe', 28000, true, 7),
  ('00000000-0000-4000-8000-000000000001', 'Banana bread slice', null, 'cafe', 12000, true, 8);

insert into pricing_rules (club_id, label, days_of_week, starts_at_time, ends_at_time, kind, value_percent, priority)
values
  ('00000000-0000-4000-8000-000000000001', 'Weekday off-peak (before 4pm)',
   array[1, 2, 3, 4, 5]::smallint[], '06:00', '16:00', 'percent_delta', -20.000, 10),
  ('00000000-0000-4000-8000-000000000001', 'Weekday prime time (4pm onward)',
   array[1, 2, 3, 4, 5]::smallint[], '16:00', '22:00', 'percent_delta', 15.000, 20),
  ('00000000-0000-4000-8000-000000000001', 'Weekend surcharge',
   array[0, 6]::smallint[], null, null, 'percent_delta', 25.000, 30);

insert into pricing_rules (club_id, label, days_of_week, applies_to_tier, kind, value_percent, priority)
values
  ('00000000-0000-4000-8000-000000000001', 'Pro member discount',
   '{}'::smallint[], 'pro', 'percent_delta', -15.000, 40);

-- How the club takes payment. Instructions are copy the guest reads at checkout.
insert into payment_methods (
  club_id, method, label, account_name, account_number, instructions,
  requires_proof, sort_order
)
values
  ('00000000-0000-4000-8000-000000000001', 'gcash', 'GCash',
   'Baseline Pickleball Club', '0917 123 4567',
   'Send the exact total to the number above, then upload the receipt screenshot. Your court is held for 30 minutes while we verify.',
   true, 1),
  ('00000000-0000-4000-8000-000000000001', 'bank_transfer', 'Bank transfer (BPI)',
   'Baseline Pickleball Club Inc.', '1234-5678-90',
   'Transfer the exact total and upload the confirmation screenshot. Transfers after 5pm are verified the next morning.',
   true, 2),
  ('00000000-0000-4000-8000-000000000001', 'cash', 'Pay at the desk',
   null, null,
   'Settle in cash when you arrive. Please come 10 minutes before your slot so we can check you in.',
   false, 3);

-- ===== supabase/migrations/20261015000000_storage_buckets.sql =====
-- Images moved from ImageKit to Supabase Storage. Uploads happen on the server
-- with the service-role key (which bypasses RLS), so no storage policies are
-- needed for writes.
--   catalog          public  — court, product and payment-method images
--   payment-proofs   private — read only through short-lived signed URLs
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('catalog', 'catalog', true, 5242880, array['image/png', 'image/jpeg', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
