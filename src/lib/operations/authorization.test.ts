import { describe, expect, it } from 'vitest';
import { can, isOphanimMemberRole, OrganizationAccessError, requireOrganizationAccess } from './authorization';
import type { OrganizationActor } from './types';

const analyst: OrganizationActor = {
  userId: 'user-1',
  organizationId: 'organization-a',
  role: 'analyst',
};

describe('organization authorization', () => {
  it('permits only the shipment actions granted to an analyst', () => {
    expect(can(analyst, 'shipment:read')).toBe(true);
    expect(can(analyst, 'shipment:write')).toBe(true);
    expect(can(analyst, 'shipment:archive')).toBe(false);
  });

  it('rejects a request scoped to another organization', () => {
    expect(() => requireOrganizationAccess(analyst, 'organization-b', 'shipment:read')).toThrow(OrganizationAccessError);
  });

  it('accepts only declared membership roles', () => {
    expect(isOphanimMemberRole('owner')).toBe(true);
    expect(isOphanimMemberRole('administrator')).toBe(false);
  });
});
