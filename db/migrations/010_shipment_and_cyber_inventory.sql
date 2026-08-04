alter table ophanim_shipments add column if not exists mmsi_number text check (mmsi_number is null or mmsi_number ~ '^\\d{9}$');
alter table ophanim_shipments add column if not exists customer_contact text;
alter table ophanim_shipments add column if not exists transshipment_ports jsonb not null default '[]'::jsonb;
create index if not exists ophanim_shipments_organization_mmsi on ophanim_shipments (organization_id, mmsi_number) where mmsi_number is not null and archived_at is null;

alter table ophanim_customers add column if not exists account_owner_user_id uuid references ophanim_users(id) on delete set null;
alter table ophanim_customers add column if not exists technical_owner_user_id uuid references ophanim_users(id) on delete set null;
alter table ophanim_customers add column if not exists security_contact text;
alter table ophanim_customers add column if not exists executive_contact text;
alter table ophanim_customers add column if not exists escalation_contact text;
alter table ophanim_customers add column if not exists service_tier text;
alter table ophanim_customers add column if not exists response_sla_hours integer check (response_sla_hours is null or response_sla_hours between 1 and 8760);
alter table ophanim_customers add column if not exists remediation_sla_hours integer check (remediation_sla_hours is null or remediation_sla_hours between 1 and 8760);
alter table ophanim_customers add column if not exists tags jsonb not null default '[]'::jsonb;

alter table ophanim_assets add column if not exists customer_id uuid references ophanim_customers(id) on delete cascade;
alter table ophanim_assets add column if not exists hostname text;
alter table ophanim_assets add column if not exists domain text;
alter table ophanim_assets add column if not exists ip_address inet;
alter table ophanim_assets add column if not exists exposure_scope text not null default 'unknown' check (exposure_scope in ('public', 'internal', 'unknown'));
alter table ophanim_assets add column if not exists internet_facing boolean;
alter table ophanim_assets add column if not exists vendor text;
alter table ophanim_assets add column if not exists product text;
alter table ophanim_assets add column if not exists product_version text;
alter table ophanim_assets add column if not exists operating_system text;
alter table ophanim_assets add column if not exists software_package text;
alter table ophanim_assets add column if not exists cloud_provider text;
alter table ophanim_assets add column if not exists cloud_account text;
alter table ophanim_assets add column if not exists cloud_region text;
alter table ophanim_assets add column if not exists asset_owner text;
alter table ophanim_assets add column if not exists technical_owner text;
alter table ophanim_assets add column if not exists inventory_source text;
alter table ophanim_assets add column if not exists inventory_confidence smallint check (inventory_confidence is null or inventory_confidence between 0 and 100);
alter table ophanim_assets add column if not exists last_observed_at timestamptz;
alter table ophanim_assets add column if not exists last_verified_at timestamptz;
alter table ophanim_assets add column if not exists verification_status text not null default 'verification_required' check (verification_status in ('verified', 'version_unknown', 'inventory_stale', 'verification_required', 'inventory_incomplete'));
alter table ophanim_assets add column if not exists archived_at timestamptz;
create index if not exists ophanim_assets_customer_active on ophanim_assets (organization_id, customer_id, criticality desc, asset_name) where archived_at is null;
create index if not exists ophanim_assets_customer_domain on ophanim_assets (organization_id, customer_id, lower(domain)) where domain is not null and archived_at is null;
create index if not exists ophanim_assets_customer_ip on ophanim_assets (organization_id, customer_id, ip_address) where ip_address is not null and archived_at is null;

create table if not exists ophanim_vendor_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references ophanim_organizations(id) on delete cascade,
  customer_id uuid not null references ophanim_customers(id) on delete cascade,
  vendor text not null check (char_length(trim(vendor)) between 1 and 240),
  product_or_service text,
  dependency_type text not null default 'service' check (dependency_type in ('service', 'software', 'cloud', 'supplier', 'integration', 'other')),
  business_criticality smallint not null default 3 check (business_criticality between 1 and 5),
  internal_owner text,
  security_contact text,
  verification_status text not null default 'verification_required' check (verification_status in ('verified', 'version_unknown', 'inventory_stale', 'verification_required', 'inventory_incomplete')),
  last_verified_at timestamptz,
  archived_at timestamptz,
  created_by_user_id uuid references ophanim_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, vendor, product_or_service)
);
create index if not exists ophanim_vendor_dependencies_customer_active on ophanim_vendor_dependencies (organization_id, customer_id, business_criticality desc, vendor) where archived_at is null;
