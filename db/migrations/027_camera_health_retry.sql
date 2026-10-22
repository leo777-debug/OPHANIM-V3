-- Additive compatibility: preserve feed failure history in the existing shared store.
alter table ophanim_camera_health add column consecutive_failures integer not null default 0
 check(consecutive_failures between 0 and 100);
