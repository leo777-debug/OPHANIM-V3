-- Existing tenant-integrity migration supplies the shipment composite key.
alter table public.ophanim_knowledge_documents add constraint knowledge_shipment_scope_fk
 foreign key (organization_id,shipment_id) references public.ophanim_shipments(organization_id,id);
alter table public.ophanim_knowledge_documents add constraint knowledge_shared_has_no_shipment
 check (organization_id is not null or shipment_id is null);
