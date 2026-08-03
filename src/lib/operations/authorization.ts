import {
  OPHANIM_MEMBER_ROLES,
  type OphanimMemberRole,
  type OrganizationActor,
  type OrganizationPermission,
} from './types';

export class OrganizationAccessError extends Error {
  constructor(message = 'You are not authorized to access this organization.') {
    super(message);
    this.name = 'OrganizationAccessError';
  }
}

const permissions: Record<OphanimMemberRole, OrganizationPermission[]> = {
  owner: ['import:read', 'import:write', 'shipment:read', 'shipment:write', 'shipment:archive', 'disruption:read', 'disruption:write', 'rescue:read', 'rescue:write', 'vulnerability:read', 'vulnerability:write', 'research:run', 'organization:manage'],
  operations_manager: ['import:read', 'import:write', 'shipment:read', 'shipment:write', 'shipment:archive', 'disruption:read', 'disruption:write', 'rescue:read', 'rescue:write', 'vulnerability:read', 'vulnerability:write', 'research:run'],
  analyst: ['import:read', 'import:write', 'shipment:read', 'shipment:write', 'disruption:read', 'rescue:read', 'vulnerability:read', 'research:run'],
  viewer: ['import:read', 'shipment:read', 'disruption:read', 'rescue:read', 'vulnerability:read'],
};

export function isOphanimMemberRole(value: unknown): value is OphanimMemberRole {
  return typeof value === 'string' && OPHANIM_MEMBER_ROLES.includes(value as OphanimMemberRole);
}

export function can(actor: OrganizationActor, permission: OrganizationPermission): boolean {
  return permissions[actor.role].includes(permission);
}

export function requireOrganizationAccess(
  actor: OrganizationActor,
  organizationId: string,
  permission: OrganizationPermission,
): void {
  if (actor.organizationId !== organizationId || !can(actor, permission)) {
    throw new OrganizationAccessError();
  }
}
