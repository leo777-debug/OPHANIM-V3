-- The original checks were written '^\\d{7}$' / '^\\d{9}$' (doubled backslash). In a
-- standard SQL string that matches a literal backslash, so every real IMO and MMSI number was
-- rejected and shipments carrying one could not be saved or imported.
-- Recreate the checks with plain digit classes.
alter table ophanim_shipments drop constraint if exists ophanim_shipments_imo_number_check;
alter table ophanim_shipments add constraint ophanim_shipments_imo_number_check check (imo_number is null or imo_number ~ '^[0-9]{7}$');
alter table ophanim_shipments drop constraint if exists ophanim_shipments_mmsi_number_check;
alter table ophanim_shipments add constraint ophanim_shipments_mmsi_number_check check (mmsi_number is null or mmsi_number ~ '^[0-9]{9}$');
do $$ begin
  if to_regclass('public.ophanim_routes') is not null then
    alter table ophanim_routes drop constraint if exists ophanim_routes_imo_number_check;
    alter table ophanim_routes add constraint ophanim_routes_imo_number_check check (imo_number is null or imo_number ~ '^[0-9]{7}$');
    alter table ophanim_routes drop constraint if exists ophanim_routes_mmsi_number_check;
    alter table ophanim_routes add constraint ophanim_routes_mmsi_number_check check (mmsi_number is null or mmsi_number ~ '^[0-9]{9}$');
  end if;
end $$;
