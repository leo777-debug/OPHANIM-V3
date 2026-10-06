-- Ensure a tenant-scoped child can only reference a parent in the same tenant.

alter table public.ophanim_customers
  add constraint ophanim_customers_organization_id_unique unique (organization_id, id);
alter table public.ophanim_shipments
  add constraint ophanim_shipments_organization_id_unique unique (organization_id, id);
alter table public.ophanim_shipment_imports
  add constraint ophanim_shipment_imports_organization_id_unique unique (organization_id, id);
alter table public.ophanim_imports
  add constraint ophanim_imports_organization_id_unique unique (organization_id, id);
alter table public.ophanim_routes
  add constraint ophanim_routes_organization_id_unique unique (organization_id, id);

alter table public.ophanim_shipments
  add constraint ophanim_shipments_customer_tenant_fk
  foreign key (organization_id, customer_id)
  references public.ophanim_customers (organization_id, id);

alter table public.ophanim_shipment_route_stops
  add constraint ophanim_shipment_route_stops_shipment_tenant_fk
  foreign key (organization_id, shipment_id)
  references public.ophanim_shipments (organization_id, id) on delete cascade;

alter table public.ophanim_shipment_milestones
  add constraint ophanim_shipment_milestones_shipment_tenant_fk
  foreign key (organization_id, shipment_id)
  references public.ophanim_shipments (organization_id, id) on delete cascade;

alter table public.ophanim_shipment_import_rows
  add constraint ophanim_shipment_import_rows_import_tenant_fk
  foreign key (organization_id, shipment_import_id)
  references public.ophanim_shipment_imports (organization_id, id) on delete cascade;
alter table public.ophanim_shipment_import_rows
  add constraint ophanim_shipment_import_rows_shipment_tenant_fk
  foreign key (organization_id, imported_shipment_id)
  references public.ophanim_shipments (organization_id, id);

alter table public.ophanim_import_rows
  add constraint ophanim_import_rows_import_tenant_fk
  foreign key (organization_id, import_id)
  references public.ophanim_imports (organization_id, id) on delete cascade;

alter table public.ophanim_import_jobs
  add constraint ophanim_import_jobs_import_tenant_fk
  foreign key (organization_id, import_id)
  references public.ophanim_imports (organization_id, id) on delete cascade;

alter table public.ophanim_documents
  add constraint ophanim_documents_shipment_tenant_fk
  foreign key (organization_id, shipment_id)
  references public.ophanim_shipments (organization_id, id);

alter table public.ophanim_routes
  add constraint ophanim_routes_shipment_tenant_fk
  foreign key (organization_id, shipment_id)
  references public.ophanim_shipments (organization_id, id);

alter table public.ophanim_route_waypoints
  add constraint ophanim_route_waypoints_route_tenant_fk
  foreign key (organization_id, route_id)
  references public.ophanim_routes (organization_id, id) on delete cascade;
