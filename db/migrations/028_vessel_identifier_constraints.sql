-- Earlier SQL literals double-escaped digit classes and rejected valid IDs.
-- Replace only these checks; preserve rows, columns, ownership and RLS policies.
-- NOT VALID avoids rewriting/scanning historical rows; new writes are checked.
alter table ophanim_shipments
  drop constraint if exists ophanim_shipments_imo_number_check,
  add constraint ophanim_shipments_imo_number_check
    check (imo_number is null or imo_number ~ '^[0-9]{7}$') not valid,
  drop constraint if exists ophanim_shipments_mmsi_number_check,
  add constraint ophanim_shipments_mmsi_number_check
    check (mmsi_number is null or mmsi_number ~ '^[0-9]{9}$') not valid;

alter table ophanim_routes
  drop constraint if exists ophanim_routes_imo_number_check,
  add constraint ophanim_routes_imo_number_check
    check (imo_number is null or imo_number ~ '^[0-9]{7}$') not valid,
  drop constraint if exists ophanim_routes_mmsi_number_check,
  add constraint ophanim_routes_mmsi_number_check
    check (mmsi_number is null or mmsi_number ~ '^[0-9]{9}$') not valid;
