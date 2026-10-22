-- Existing bootstrap revokes all authenticated grants; restore only these narrow surfaces.
alter table public.ophanim_verify_runs enable row level security;
alter table public.ophanim_verify_shares enable row level security;
revoke all on public.ophanim_verify_runs, public.ophanim_verify_shares from anon, authenticated;
grant select on public.ophanim_verify_runs to authenticated;
grant select on public.ophanim_verify_shares to authenticated;
grant all on public.ophanim_verify_runs, public.ophanim_verify_shares to service_role;
create policy verify_runs_read on public.ophanim_verify_runs for select to authenticated
  using (app_private.is_organization_member(organization_id) and user_id = app_private.current_ophanim_user_id());
create policy verify_shares_read on public.ophanim_verify_shares for select to authenticated
  using (app_private.is_organization_member(organization_id) and user_id = app_private.current_ophanim_user_id());
-- Verdicts and share snapshots are created only by the backend's checked/authenticated flow.
-- Granting client INSERT would allow fabricated CONFIRMED verdicts through the Data API.
-- Public shares have no anonymous table policy. Only the backend token-hash lookup serves a whitelist snapshot.
