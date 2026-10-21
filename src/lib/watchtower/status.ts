// Feed health persistence: shared public data in ophanim_camera_feed_status, or
// process memory when no database is configured (demo).
import { db } from '@/lib/db/pool';
import { checkFeed, verifiedCatalogueFeeds, type FeedHealth } from './cameras';

const memory = ((globalThis as { __ophanimFeedHealth?: Map<string, FeedHealth> }).__ophanimFeedHealth ??= new Map());
type Row = { feed_id: string; status: FeedHealth['status']; last_seen: Date | null; last_checked: Date; failures: number; detail: string | null };

export async function readFeedHealth(query = process.env.DATABASE_URL ? (sql: string, values: unknown[]) => db().query<Row>(sql, values) : null): Promise<Map<string, FeedHealth>> {
  if (!query) return new Map(memory);
  const rows = (await query('select feed_id,status,last_seen,last_checked,failures,detail from ophanim_camera_feed_status', [])).rows;
  return new Map(rows.map(row => [row.feed_id, { feedId: row.feed_id, status: row.status, lastSeen: row.last_seen?.toISOString() ?? null, lastChecked: row.last_checked.toISOString(), failures: row.failures, detail: row.detail }]));
}
async function writeFeedHealth(health: FeedHealth) {
  if (!process.env.DATABASE_URL) { memory.set(health.feedId, health); return; }
  await db().query(`insert into ophanim_camera_feed_status(feed_id,status,last_seen,last_checked,failures,detail) values($1,$2,$3,$4,$5,$6)
    on conflict (feed_id) do update set status=excluded.status,last_seen=excluded.last_seen,last_checked=excluded.last_checked,failures=excluded.failures,detail=excluded.detail`,
    [health.feedId, health.status, health.lastSeen, health.lastChecked, health.failures, health.detail]);
}
/** One check per verified feed, no more often than every 15 minutes, spaced out to respect sources. */
export async function runFeedHealthCheck(now = Date.now()) {
  const previous = await readFeedHealth(), results: FeedHealth[] = [];
  for (const feed of verifiedCatalogueFeeds()) {
    const last = previous.get(feed.id);
    if (last && now - Date.parse(last.lastChecked) < 15 * 60e3) continue;
    const health = await checkFeed(feed, last, now);
    await writeFeedHealth(health); results.push(health);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return results;
}
