import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db/pool';
import { hashPassword, verifyPassword } from '@/lib/auth/passwords';
import type { OrganizationActor } from '@/lib/operations/types';
import { requireOrganizationAccess } from '@/lib/operations/authorization';
import { DEFAULT_PRESENTATION, PRESENTATION_VERIFY_AVAILABLE, type PresentationSettings } from './types';
import { PresentationError } from './http';

interface SettingsRow {
  presentation_mode: boolean; presentation_default_view: 'map' | 'full'; presentation_replay: 'auto' | 'on' | 'off';
  presentation_verify_button: boolean; pin_required: boolean; revision: number; updated_at: string | Date;
}
let cached: { settings: PresentationSettings; until: number } | undefined;
let reading: Promise<PresentationSettings> | undefined;
const columns = 'presentation_mode,presentation_default_view,presentation_replay,presentation_verify_button,pin_required,revision,updated_at';
function settings(row?: SettingsRow): PresentationSettings {
  return row ? { enabled: row.presentation_mode, defaultView: row.presentation_default_view, replay: row.presentation_replay,
    verifyButton: row.presentation_verify_button && PRESENTATION_VERIFY_AVAILABLE, pinRequired: row.pin_required, revision: row.revision, updatedAt: new Date(row.updated_at).toISOString() } : { ...DEFAULT_PRESENTATION };
}
export async function readPresentationSettings(fresh = false): Promise<PresentationSettings> {
  if (!process.env.DATABASE_URL) return { ...DEFAULT_PRESENTATION };
  if (!fresh && cached && cached.until > Date.now()) return cached.settings;
  if (reading) return reading;
  reading = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Cold serverless connections need a TCP/TLS handshake before the query.
      const query = { text: `select ${columns} from ophanim_presentation_settings where id=1`, query_timeout: 4000 };
      const result = await Promise.race([db().query<SettingsRow>(query), new Promise<never>((_,reject) => { timer = setTimeout(()=>reject(new Error('Settings timed out.')),10000); })]);
      const value = settings(result.rows[0]);
      cached = { settings: value, until: Date.now() + 2000 };
      return value;
    } finally { if (timer) clearTimeout(timer); reading = undefined; }
  })();
  return reading;
}
export function invalidatePresentationSettings() { cached = undefined; }
export async function presentationSettingsOrOff(fresh = false) {
  try { return await readPresentationSettings(fresh); } catch { return { ...DEFAULT_PRESENTATION }; }
}
export async function updatePresentationSettings(actor: OrganizationActor, input: Record<string, unknown>) {
  requireOrganizationAccess(actor, actor.organizationId, 'organization:manage');
  const allowed = new Set(['enabled','defaultView','replay','verifyButton','pin','revision']);
  if (Object.keys(input).some(key=>!allowed.has(key))) throw new PresentationError('Unknown presentation setting.');
  if (typeof input.enabled !== 'boolean' || !['map','full'].includes(String(input.defaultView)) || !['auto','on','off'].includes(String(input.replay)) || typeof input.verifyButton !== 'boolean' || !Number.isInteger(input.revision)) throw new PresentationError('Invalid presentation settings.');
  if (input.verifyButton && !PRESENTATION_VERIFY_AVAILABLE) throw new PresentationError('Verify is not included in this branch yet.', 409);
  if (input.pin !== undefined && input.pin !== null && (typeof input.pin !== 'string' || !/^\d{4,12}$/.test(input.pin))) throw new PresentationError('Use 4-12 digits for the switch PIN, or clear it.');
  const pinHash = typeof input.pin === 'string' ? await hashPassword(`presentation-pin:${input.pin}`) : null;
  const client = await db().connect();
  try {
    await client.query('begin');
    const current = await client.query<SettingsRow>(`select ${columns} from ophanim_presentation_settings where id=1 for update`);
    if (!current.rows[0]) throw new PresentationError('Run the presentation migration first.', 503);
    const old = settings(current.rows[0]);
    if (old.revision !== input.revision) throw new PresentationError('Settings changed in another tab. Reload and try again.', 409);
    const pinRequired = input.pin === undefined ? old.pinRequired : input.pin !== null;
    if (input.pin !== undefined) {
      await client.query('update ophanim_private.presentation_secrets set pin_hash=$1,pin_version=pin_version+1 where id=1', [pinHash]);
      await client.query('delete from ophanim_private.presentation_view_grants');
    }
    const result = await client.query<SettingsRow>(`update ophanim_presentation_settings set presentation_mode=$1,presentation_default_view=$2,presentation_replay=$3,presentation_verify_button=$4,pin_required=$5,revision=revision+1,updated_at=now() where id=1 returning ${columns}`, [input.enabled,input.defaultView,input.replay,input.verifyButton,pinRequired]);
    const next = settings(result.rows[0]);
    await client.query(`insert into ophanim_private.presentation_audit(actor_user_id,organization_id,action,old_value,new_value) values($1,$2,'settings.changed',$3,$4)`, [actor.userId,actor.organizationId,JSON.stringify(old),JSON.stringify({ ...next, pinChanged: input.pin !== undefined })]);
    await client.query('commit');
    invalidatePresentationSettings();
    return next;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export async function fullViewUnlocked(cookie: string | undefined, settings: PresentationSettings): Promise<boolean> {
  if (!settings.pinRequired) return true;
  if (!cookie || !/^full\.[a-zA-Z0-9_-]{43}$/.test(cookie)) return false;
  const result = await db().query(`select 1 from ophanim_private.presentation_view_grants g join ophanim_private.presentation_secrets s on s.id=1 where g.token_hash=$1 and g.pin_version=s.pin_version and g.expires_at>now()`, [digest(cookie.slice(5))]);
  return Boolean(result.rowCount);
}
export async function unlockFullView(pin: unknown): Promise<string> {
  if (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin)) throw new PresentationError('Enter the switch PIN.', 401);
  const result = await db().query<{pin_hash:string|null;pin_version:number}>('select pin_hash,pin_version from ophanim_private.presentation_secrets where id=1');
  if (!result.rows[0]?.pin_hash || !await verifyPassword(`presentation-pin:${pin}`,result.rows[0].pin_hash)) throw new PresentationError('Incorrect switch PIN.', 401);
  const token = randomBytes(32).toString('base64url');
  await db().query('delete from ophanim_private.presentation_view_grants where expires_at<=now()');
  await db().query(`insert into ophanim_private.presentation_view_grants(token_hash,pin_version,expires_at) values($1,$2,now()+interval '4 hours')`,[digest(token),result.rows[0].pin_version]);
  return `full.${token}`;
}
