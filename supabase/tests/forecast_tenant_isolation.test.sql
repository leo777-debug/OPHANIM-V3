-- Tenant-isolation and immutable ledger regression, executable on Supabase/Postgres.
begin;
select '1..1';
insert into auth.users(id,email,raw_user_meta_data) values('31000000-0000-4000-8000-000000000001','panel-a@ophanim.test','{}');
insert into ophanim_users(id,auth_user_id,email) values('41000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','panel-a@ophanim.test');
insert into ophanim_organizations(id,name,slug) values('10000000-0000-4000-8000-000000000001','Panel test A','panel-test-a'),('20000000-0000-4000-8000-000000000002','Panel test B','panel-test-b');
insert into ophanim_organization_memberships(organization_id,user_id,role) values('10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','owner');
insert into ophanim_shipments(id,organization_id,shipment_reference) values('11000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','PANEL-A'),('22000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','PANEL-B');
do $$ declare org uuid; ship uuid; snap uuid; q uuid; f uuid; begin
 for org,ship in select organization_id,id from ophanim_shipments loop
  insert into ophanim_shipment_events(organization_id,shipment_id,event_type,occurred_at,source,provenance) values(org,ship,'arrival',now(),'test','{}');
  insert into ophanim_feature_snapshots(organization_id,shipment_id,feature_set_version,features) values(org,ship,'test','{}') returning id into snap;
  insert into ophanim_forecast_questions(organization_id,shipment_id,question_type,question_text,threshold,resolve_by) values(org,ship,'arrives_by','Test question','{}',now()+interval '1 day') returning id into q;
  insert into ophanim_forecasts(organization_id,shipment_id,question_id,source_type,probability,feature_snapshot_id,trigger) values(org,ship,q,'base_rate',.7,snap,'{}') returning id into f;
  insert into ophanim_forecast_outcomes(organization_id,question_id,outcome,resolution_source,evidence) values(org,q,true,'test','{}');
  insert into ophanim_forecast_scores(organization_id,forecast_id,brier,log_loss) values(org,f,.09,.3567);
  insert into ophanim_forecast_score_rollups(organization_id,source_type,lane,question_type,month,n,mean_brier,calibration_bins) values(org,'base_rate','secret-lane','arrives_by','2026-10-01',1,.09,'[]');
  insert into ophanim_forecast_training_consent(organization_id) values(org);
  insert into ophanim_model_versions(organization_id,model_name,version,algorithm,feature_set_version,training_window,training_row_count,training_data_hash,artifact_uri,artifact_sha256,metrics)
   values(org,'test','1','test','test',tstzrange(now()-interval '1 month',now()),1,repeat('a',64),'private',repeat('b',64),'{}');
 end loop;
end $$;
select set_config('request.jwt.claim.sub','31000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ declare t text; n int; begin
 foreach t in array array['ophanim_shipment_events','ophanim_feature_snapshots','ophanim_forecast_questions','ophanim_forecasts','ophanim_forecast_outcomes','ophanim_forecast_scores','ophanim_forecast_score_rollups','ophanim_forecast_training_consent','ophanim_model_versions'] loop
  execute format('select count(*) from %I',t) into n;
  if n<>1 then raise exception 'Tenant isolation failed for %: % rows',t,n;end if;
  begin execute format('delete from %I',t);raise exception 'Browser mutation unexpectedly allowed for %',t;exception when insufficient_privilege then null;end;
 end loop;
end $$;
reset role;
do $$ begin
 begin update ophanim_forecasts set probability=.99;raise exception 'Immutable forecast unexpectedly changed';exception when raise_exception then if sqlerrm not like 'Append-only%' then raise;end if;end;
 begin delete from ophanim_feature_snapshots;raise exception 'Immutable snapshot unexpectedly deleted';exception when raise_exception then if sqlerrm not like 'Append-only%' then raise;end if;end;
 begin insert into ophanim_shipment_events(organization_id,shipment_id,event_type,occurred_at,source,provenance) values('10000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000002','arrival',now(),'test','{}');raise exception 'Cross-tenant parent accepted';exception when foreign_key_violation then null;end;
 begin update ophanim_model_versions set status='active';raise exception 'Unvalidated model activated';exception when raise_exception then if sqlerrm not like 'Backtest promotion%' then raise;end if;end;
end $$;
set local role anon;
do $$ begin
 if exists(select 1 from ophanim_public_receipts) then raise exception 'Small-tenant receipts leaked';end if;
 begin perform * from ophanim_forecasts;raise exception 'Anonymous forecasts leaked';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'ok 1 - every Panel table isolates tenants; append-only and promotion gates hold';
rollback;
