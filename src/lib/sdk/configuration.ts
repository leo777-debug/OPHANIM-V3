/** The process-local SDK feed is explicitly bound to one organization UUID. */
export function sdkOrganizationId(env: Record<string, string | undefined> = process.env): string | null {
  const value = env.SDK_ORGANIZATION_ID?.trim();
  return value && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value) ? value : null;
}
