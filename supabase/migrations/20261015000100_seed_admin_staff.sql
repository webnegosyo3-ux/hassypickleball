-- Make admin@hassypickleball.com an administrator of the club.
-- Idempotent: safe to re-run, and a no-op if the auth user does not exist yet.

insert into staff (user_id, club_id, role, full_name)
select u.id, c.id, 'admin', 'Admin'
from auth.users u
cross join clubs c
where u.email = 'admin@hassypickleball.com'
  and c.id = '00000000-0000-4000-8000-000000000001'
on conflict (user_id) do update
  set role = 'admin', club_id = excluded.club_id, is_active = true;
