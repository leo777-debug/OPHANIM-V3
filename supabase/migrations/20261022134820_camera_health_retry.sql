-- Shared public-feed health only; retain the existing server-only write policy.
alter table public.ophanim_camera_health enable row level security;
alter table public.ophanim_camera_health force row level security;
comment on column public.ophanim_camera_health.consecutive_failures is
 'Consecutive permitted endpoint failures, capped at 100. HTTP reachability is never playback verification.';
