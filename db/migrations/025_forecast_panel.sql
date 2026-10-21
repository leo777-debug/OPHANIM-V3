-- The Panel: a separate probability ledger; existing heuristic assessments remain inputs.
alter table ophanim_shipment_milestones add column if not exists actual_at timestamptz;
alter table ophanim_shipment_milestones add column if not exists actual_source text;
alter table ophanim_shipment_milestones add constraint ophanim_milestone_actual_provenance check(actual_at is null or actual_source is not null);
alter table ophanim_shipments add column if not exists historical boolean not null default false;

create table ophanim_shipment_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id),
 shipment_id uuid not null references ophanim_shipments(id), event_type text not null,
 occurred_at timestamptz not null, recorded_at timestamptz not null default now(), source text not null,
 provenance jsonb not null, unique(organization_id,shipment_id,event_type,occurred_at,source)
);
create table ophanim_public_history (
 id uuid primary key default gen_random_uuid(), source text not null, metric text not null, location_code text not null,
 observed_at timestamptz not null, available_at timestamptz not null default now(), value jsonb not null, licence text not null,
 unique(source,metric,location_code,observed_at)
);
create table ophanim_feature_snapshots (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id),
 shipment_id uuid not null references ophanim_shipments(id), as_of timestamptz not null default now(),
 feature_set_version text not null, features jsonb not null, created_at timestamptz not null default clock_timestamp(),
 check(as_of <= created_at), unique(id,organization_id), unique(id,shipment_id,organization_id)
);
create table ophanim_forecast_questions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id),
 shipment_id uuid not null references ophanim_shipments(id), question_type text not null check(question_type in
 ('arrives_by','clears_customs_by','delay_over_days','eta_distribution','sanctions_exposure','congestion','demurrage')),
 question_text text not null, threshold jsonb not null, resolve_by timestamptz not null,
 status text not null default 'open' check(status in ('open','resolved','void')),
 created_at timestamptz not null default now(), unique(id,organization_id), unique(id,shipment_id,organization_id)
);
create table ophanim_model_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid references ophanim_organizations(id),
 model_name text not null, version text not null, algorithm text not null, feature_set_version text not null,
 training_window tstzrange not null, training_row_count integer not null check(training_row_count > 0),
 training_data_hash text not null check(training_data_hash ~ '^[a-f0-9]{64}$'), artifact_uri text not null,
 artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'), metrics jsonb not null,
 status text not null default 'candidate' check(status in ('candidate','active','retired')),
 trained_at timestamptz not null default now(), unique(id,organization_id),
 check(organization_id is not null or coalesce(metrics->>'training_scope','') = 'public_only')
);
create unique index ophanim_model_active on ophanim_model_versions(coalesce(organization_id,'00000000-0000-0000-0000-000000000000'::uuid),model_name) where status='active';
create table ophanim_forecasts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id),
 shipment_id uuid not null references ophanim_shipments(id), question_id uuid not null,
 source_type text not null check(source_type in ('ensemble','component_model','analog','base_rate','carrier_eta','human')),
 model_version_id uuid references ophanim_model_versions(id), user_id uuid references ophanim_users(id),
 probability double precision check(probability between 0 and 1), p10_at timestamptz, p50_at timestamptz, p90_at timestamptz,
 base_rate double precision check(base_rate between 0 and 1), drivers jsonb not null default '[]', analogs jsonb not null default '[]',
 rules_fired jsonb not null default '[]', feature_snapshot_id uuid not null,
 trigger jsonb not null, issued_at timestamptz not null default now(), unique(id,organization_id),
 foreign key(question_id,shipment_id,organization_id) references ophanim_forecast_questions(id,shipment_id,organization_id),
 foreign key(feature_snapshot_id,shipment_id,organization_id) references ophanim_feature_snapshots(id,shipment_id,organization_id),
 check(probability is not null or (p10_at is not null and p50_at is not null and p90_at is not null)),
 check((p10_at is null and p50_at is null and p90_at is null) or (p10_at <= p50_at and p50_at <= p90_at)),
 check((source_type='human' and user_id is not null) or (source_type<>'human' and user_id is null)),
 check(source_type not in ('ensemble','component_model','analog') or model_version_id is not null)
);
create table ophanim_forecast_outcomes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id),
 question_id uuid not null unique, outcome boolean, actual_at timestamptz, resolved_at timestamptz not null default now(),
 resolution_source text not null, reviewer_user_id uuid references ophanim_users(id), evidence jsonb not null,
 intervention boolean not null default false, foreign key(question_id,organization_id) references ophanim_forecast_questions(id,organization_id),
 check(outcome is not null or actual_at is not null), check(resolution_source <> 'manual' or reviewer_user_id is not null)
 ,foreign key(organization_id,reviewer_user_id) references ophanim_organization_memberships(organization_id,user_id)
);
create table ophanim_forecast_scores (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id), forecast_id uuid not null unique,
 brier double precision check(brier between 0 and 1), log_loss double precision check(log_loss >= 0),
 abs_error_hours double precision check(abs_error_hours >= 0), interval_hit boolean, scored_at timestamptz not null default now(),
 foreign key(forecast_id,organization_id) references ophanim_forecasts(id,organization_id)
);
create table ophanim_forecast_score_rollups (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references ophanim_organizations(id), source_type text not null,
 model_version_id uuid references ophanim_model_versions(id), lane text not null, question_type text not null, month date not null,
 analyst_key text not null default 'aggregate',
 n integer not null check(n > 0), mean_brier double precision, mean_log_loss double precision, calibration_bins jsonb not null,
 sharpness double precision, updated_at timestamptz not null default now()
);
create table ophanim_forecast_training_consent (
 organization_id uuid primary key references ophanim_organizations(id), pooled_derived_features boolean not null default false,
 public_receipts boolean not null default false, recorded_by_user_id uuid references ophanim_users(id), recorded_at timestamptz not null default now()
 ,foreign key(organization_id,recorded_by_user_id) references ophanim_organization_memberships(organization_id,user_id)
);
create table ophanim_camera_health (
 feed_id text primary key, checked_at timestamptz not null, last_seen timestamptz,
 status text not null check(status in ('online','offline','unverified')), detail text not null
);

create function ophanim_reject_ledger_mutation() returns trigger language plpgsql as $$
begin raise exception 'Append-only evidence: issue a new record instead'; end $$;
create trigger ophanim_forecasts_immutable before update or delete on ophanim_forecasts for each row execute function ophanim_reject_ledger_mutation();
create trigger ophanim_snapshots_immutable before update or delete on ophanim_feature_snapshots for each row execute function ophanim_reject_ledger_mutation();
create trigger ophanim_outcomes_immutable before update or delete on ophanim_forecast_outcomes for each row execute function ophanim_reject_ledger_mutation();

-- A snapshot must have existed before issuance and the outcome horizon.
create function ophanim_validate_forecast() returns trigger language plpgsql as $$
declare q ophanim_forecast_questions; s ophanim_feature_snapshots; m ophanim_model_versions;
begin
 select * into strict q from ophanim_forecast_questions where id=new.question_id and organization_id=new.organization_id;
 select * into strict s from ophanim_feature_snapshots where id=new.feature_snapshot_id and organization_id=new.organization_id;
 if q.status <> 'open' or new.issued_at < s.as_of or new.issued_at >= q.resolve_by then raise exception 'Forecast must precede resolution and follow snapshot'; end if;
 if new.model_version_id is not null then
  select * into strict m from ophanim_model_versions where id=new.model_version_id;
  if (m.organization_id is not null and m.organization_id<>new.organization_id) or m.status<>'active' or m.trained_at>new.issued_at then raise exception 'Model is not eligible for this tenant/time'; end if;
 end if;
 if new.user_id is not null and not exists(select 1 from ophanim_organization_memberships where organization_id=new.organization_id and user_id=new.user_id) then raise exception 'Human forecaster must belong to tenant'; end if;
 return new;
end $$;
create trigger ophanim_forecast_integrity before insert on ophanim_forecasts for each row execute function ophanim_validate_forecast();
create function ophanim_validate_model_promotion() returns trigger language plpgsql as $$
begin
 if new.status='active' and (TG_OP='INSERT' or old.status<>'active') then
  if coalesce((new.metrics->>'holdout_n')::integer,0)<30 or coalesce((new.metrics->>'beats_base_rate')::boolean,false)=false
   or coalesce((new.metrics->>'beats_carrier_eta')::boolean,false)=false or coalesce((new.metrics->>'beats_active')::boolean,false)=false
   or coalesce((new.metrics->>'temporal_holdout')::boolean,false)=false then raise exception 'Backtest promotion gate failed'; end if;
 end if; return new;
end $$;
create trigger ophanim_model_promotion before insert or update on ophanim_model_versions for each row execute function ophanim_validate_model_promotion();
create function ophanim_freeze_question() returns trigger language plpgsql as $$
begin
 if (new.organization_id,new.shipment_id,new.question_type,new.question_text,new.threshold,new.resolve_by,new.created_at)
  is distinct from (old.organization_id,old.shipment_id,old.question_type,old.question_text,old.threshold,old.resolve_by,old.created_at)
  or (old.status<>'open' and new.status<>old.status) then raise exception 'Question definition is immutable';end if;
 return new;
end $$;
create trigger ophanim_question_immutable before update on ophanim_forecast_questions for each row execute function ophanim_freeze_question();

create index ophanim_snapshots_training on ophanim_feature_snapshots(organization_id,as_of,shipment_id);
create index ophanim_questions_due on ophanim_forecast_questions(organization_id,status,resolve_by);
create index ophanim_forecasts_history on ophanim_forecasts(organization_id,question_id,issued_at desc);
create index ophanim_events_timeline on ophanim_shipment_events(organization_id,shipment_id,recorded_at);

-- Forecasts enter the existing alert/delivery path without pretending to be dark-web mentions.
alter table ophanim_intelligence_alerts alter column assessment_id drop not null;
alter table ophanim_intelligence_alerts add column forecast_id uuid unique;
alter table ophanim_intelligence_alerts add constraint ophanim_alert_forecast_tenant_fk foreign key(forecast_id,organization_id) references ophanim_forecasts(id,organization_id);
alter table ophanim_intelligence_alerts add constraint ophanim_alert_one_parent check((assessment_id is not null)::int+(forecast_id is not null)::int=1);
