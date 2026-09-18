-- Event points get their own date so multi-day events can place points on
-- different days (in addition to the per-point time already present).
alter table public.event_points
  add column if not exists date date;