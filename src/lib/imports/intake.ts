import { getClientIp,isRateLimited } from '@/lib/ssrf-guard';
import type { OrganizationActor } from '@/lib/operations/types';

export function importPreviewLimited(request:Request,actor:OrganizationActor):boolean {
  return isRateLimited(`import:user:${actor.userId}`,20,60_000) || isRateLimited(`import:ip:${getClientIp(request)}`,40,60_000);
}
