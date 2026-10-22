-- Run after numbered schema migrations and existing phase-1 tenant integrity.
do $$ declare t text; begin
 foreach t in array array['ophanim_shipment_events','ophanim_feature_snapshots','ophanim_forecast_questions',
  'ophanim_forecasts','ophanim_forecast_outcomes','ophanim_forecast_scores','ophanim_forecast_score_rollups','ophanim_forecast_training_consent'] loop
  execute format('alter table %I enable row level security',t);
  execute format('alter table %I force row level security',t);
  execute format('revoke all on %I from anon, authenticated',t);
  execute format('grant select on %I to authenticated',t);
  execute format('create policy forecast_tenant_read on %I for select to authenticated using(app_private.is_organization_member(organization_id))',t);
 end loop;
 foreach t in array array['ophanim_shipment_events','ophanim_feature_snapshots','ophanim_forecast_questions','ophanim_forecasts'] loop
  execute format('alter table %I add constraint %I foreign key(shipment_id,organization_id) references ophanim_shipments(id,organization_id)',t,t||'_shipment_tenant_fk');
 end loop;
end $$;
alter table ophanim_model_versions enable row level security;
alter table ophanim_model_versions force row level security;
revoke all on ophanim_model_versions from anon,authenticated;
grant select on ophanim_model_versions to authenticated;
create policy model_tenant_read on ophanim_model_versions for select to authenticated
 using(organization_id is null or app_private.is_organization_member(organization_id));
alter table ophanim_public_history enable row level security;
alter table ophanim_camera_health enable row level security;
revoke all on ophanim_public_history,ophanim_camera_health from anon,authenticated;
grant select on ophanim_public_history,ophanim_camera_health to authenticated;
create policy public_history_read on ophanim_public_history for select to authenticated using(true);
create policy camera_health_read on ophanim_camera_health for select to authenticated using(true);

-- Public receipts contain no lane, tenant, model ID or shipment identifiers. Require
-- opt-in and at least five consenting organizations and 100 forecasts per cell.
create view ophanim_public_receipts with (security_barrier=true) as
 select r.source_type,r.question_type,r.month,sum(r.n)::bigint as n,
  sum(r.mean_brier*r.n)/nullif(sum(r.n) filter(where r.mean_brier is not null),0) as mean_brier,
  sum(r.mean_log_loss*r.n)/nullif(sum(r.n) filter(where r.mean_log_loss is not null),0) as mean_log_loss
 from ophanim_forecast_score_rollups r join ophanim_forecast_training_consent c using(organization_id)
 where c.public_receipts group by r.source_type,r.question_type,r.month
 having count(distinct r.organization_id)>=5 and sum(r.n)>=100;
revoke all on ophanim_public_receipts from public,anon,authenticated;
-- Deliberately definer view: only k-anonymous aggregates are exposed; underlying
-- tenant tables stay inaccessible to anon. API selects this view only.
grant select on ophanim_public_receipts to anon,authenticated;

insert into storage.buckets(id,name,public) values('ophanim-models','ophanim-models',false)
 on conflict(id) do update set public=false;
-- No browser write policy: worker owns model writes. Organization-prefixed read.
create policy model_artifact_read on storage.objects for select to authenticated
 using(bucket_id='ophanim-models' and app_private.is_organization_member(app_private.storage_organization_id(name)));
