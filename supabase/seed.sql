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

-- No pricing_rules seeded: courts charge their flat hourly rate at all times.

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
