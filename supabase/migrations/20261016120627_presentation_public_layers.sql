-- Expand the public snapshot vocabulary; preserve existing rows, RLS and grants.
alter table public.ophanim_presentation_snapshots
  drop constraint ophanim_presentation_snapshots_feed_id_check;
alter table public.ophanim_presentation_snapshots
  add constraint ophanim_presentation_snapshots_feed_id_check
  check (feed_id in (
    'flights','maritime','earthquakes','fires','weather','satellites','cables',
    'incidents','cyber','news','space-weather','ports','chokepoints','cameras',
    'broadcasts','conflicts','infrastructure','war-sanctions'
  ));
