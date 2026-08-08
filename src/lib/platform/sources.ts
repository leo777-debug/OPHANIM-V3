import { db } from '@/lib/db/pool';
import { getProviderCatalog } from '@/lib/providers';
import { getProductionSourceCatalog } from '@/lib/providers/source-governance';

export async function synchronizeSourceRegistry() {
  const catalog = getProductionSourceCatalog();
  for (const source of catalog) {
    await db().query(`insert into ophanim_sources(id,name,category,description,authentication_required,commercial_use,attribution,retention_hours,refresh_frequency,reliability_level,enabled,metadata) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(id) do update set name=excluded.name,category=excluded.category,description=excluded.description,authentication_required=excluded.authentication_required,commercial_use=excluded.commercial_use,attribution=excluded.attribution,retention_hours=excluded.retention_hours,refresh_frequency=excluded.refresh_frequency,reliability_level=excluded.reliability_level,metadata=excluded.metadata,updated_at=now()`, [source.id, source.name, source.scope.join(','), source.purpose, Boolean(source.configuration), source.mode === 'disabled_by_default' ? 'restricted' : source.mode === 'core' ? 'review_required' : 'unknown', source.attribution, null, source.refresh, source.evidenceTier, source.mode !== 'disabled_by_default', JSON.stringify({ licensing: source.licensing, configuration: source.configuration ?? null, scope: source.scope, providerCatalogVersion: 1 })]);
  }
}

export async function listSources() {
  const sources = await db().query(`select * from ophanim_sources order by category,name`);
  const providers = getProviderCatalog();
  return { sources: sources.rows, providers };
}
