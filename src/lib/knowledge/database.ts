import type { PoolClient } from 'pg';
import { db } from '@/lib/db/pool';
import type { OrganizationActor } from '@/lib/operations/types';

export async function knowledgeTransaction<T>(actor: OrganizationActor | null, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db().connect();
  try {
    await client.query('begin');
    await client.query('set local search_path = public, extensions');
    if (actor) await client.query("select set_config('ophanim.user_id',$1,true), set_config('ophanim.organization_id',$2,true)", [actor.userId, actor.organizationId]);
    await client.query(actor ? 'set local role ophanim_knowledge_app' : 'set local role ophanim_knowledge_worker');
    const value = await work(client);
    await client.query('commit');
    return value;
  } catch (error) { await client.query('rollback'); throw error; }
  finally { client.release(); }
}
