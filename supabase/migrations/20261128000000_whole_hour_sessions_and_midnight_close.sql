-- Sessions are sold in whole hours only — one, two, three or four — so the
-- club floor moves from 30 minutes to 60 and the ceiling opens to four hours.
-- The court page's duration pills are filtered by these same bounds, so leaving
-- the floor at 30 here would keep offering a length the desk no longer takes.
alter table clubs
  alter column min_duration_minutes set default 60,
  -- The courts run until midnight. With a 24:00 close the last one-hour start
  -- is 11:00 PM on every court, and a four-hour block can still begin at
  -- 8:00 PM. The admin screen writes 00:00 back as 24:00 for the same reason.
  alter column closes_at set default '24:00';

update clubs
set min_duration_minutes = 60,
    max_duration_minutes = greatest(max_duration_minutes, 240),
    closes_at = '24:00'
where min_duration_minutes <> 60
   or max_duration_minutes < 240
   or closes_at <> '24:00';