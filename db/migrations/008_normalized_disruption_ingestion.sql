alter table ophanim_disruptions add column if not exists provider text;
alter table ophanim_disruptions add column if not exists confidence smallint check (confidence is null or confidence between 0 and 100);
create index if not exists ophanim_disruptions_ingested_identity on ophanim_disruptions (organization_id, provider, source, source_reference) where source_reference is not null;
