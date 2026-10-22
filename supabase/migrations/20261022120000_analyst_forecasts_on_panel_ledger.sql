-- Analyst (sourced) probabilities move into The Panel's single ledger.
-- Replaces parity's 20261020080311_parity_forecasts.sql, which created a second
-- `ophanim_forecasts` table with an incompatible shape and was never applied to a
-- live database. A public operational question ("Will this route reopen before …?")
-- is a question with no shipment; the analyst's probability is a `human` forecast;
-- the sourced yes/no answer is an outcome with its evidence link. Append-only and
-- immutability triggers from 025_forecast_panel.sql apply unchanged.

alter table public.ophanim_forecast_questions alter column shipment_id drop not null;
alter table public.ophanim_feature_snapshots alter column shipment_id drop not null;
alter table public.ophanim_forecasts alter column shipment_id drop not null;

alter table public.ophanim_forecast_questions drop constraint if exists ophanim_forecast_questions_question_type_check;
alter table public.ophanim_forecast_questions add constraint ophanim_forecast_questions_question_type_check check (question_type in
  ('arrives_by', 'clears_customs_by', 'delay_over_days', 'eta_distribution', 'sanctions_exposure', 'congestion', 'demurrage',
   'ghost_position', 'time_gap_risk', 'weather_impact', 'payment_date', 'dispute_odds', 'paper_risk', 'public_question'));

-- Only public questions (and their human forecasts and snapshots) may omit the shipment.
do $$ begin
  alter table public.ophanim_forecast_questions add constraint ophanim_question_shipment_or_public check (shipment_id is not null or question_type = 'public_question');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ophanim_feature_snapshots add constraint ophanim_snapshot_shipment_or_public check (shipment_id is not null or coalesce(features->>'scope', '') = 'public_question');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ophanim_forecasts add constraint ophanim_forecast_shipment_or_human check (shipment_id is not null or source_type = 'human');
exception when duplicate_object then null; end $$;

-- A shipment-less forecast must still point at a shipment-less question of its own tenant
-- (the composite foreign keys do not check rows whose shipment is null).
create or replace function public.ophanim_check_public_forecast() returns trigger language plpgsql as $$
begin
  if new.shipment_id is null and not exists (select 1 from public.ophanim_forecast_questions q where q.id = new.question_id and q.organization_id = new.organization_id and q.shipment_id is null)
     then raise exception 'Public forecast must reference a public question of the same organization'; end if;
  if new.shipment_id is null and not exists (select 1 from public.ophanim_feature_snapshots s where s.id = new.feature_snapshot_id and s.organization_id = new.organization_id and s.shipment_id is null)
     then raise exception 'Public forecast must reference a public snapshot of the same organization'; end if;
  return new;
end $$;
drop trigger if exists ophanim_public_forecast_integrity on public.ophanim_forecasts;
create trigger ophanim_public_forecast_integrity before insert on public.ophanim_forecasts for each row execute function public.ophanim_check_public_forecast();
