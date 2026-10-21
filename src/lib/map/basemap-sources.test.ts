import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPEN_FREE_MAP, NATURAL_EARTH_BASEMAP } from './basemap-sources';
import { registeredReferenceDatasets } from '@/lib/intelligence/event-provider-registry';
import { INTEGRATIONS } from '@/lib/integrations/catalog';

describe('basemap source governance and packaged reference integrity',()=>{
  it('registers both keyless map sources with reviewed commercial rights and attribution',()=>{
    for(const source of [OPEN_FREE_MAP,NATURAL_EARTH_BASEMAP]) {
      expect(registeredReferenceDatasets.some(record=>record.id===source.id)).toBe(true);
      const integration=INTEGRATIONS.find(record=>record.id===source.id);
      expect(integration?.variables).toEqual([]);
      expect(integration?.licence).toMatchObject({commercialUse:'yes',keyNeeded:false});
      expect(integration?.licence?.attribution).toBeTruthy();
      expect(integration?.licence?.rateLimits).toBeTruthy();
      expect(source.datasetDate).toBeNull();
    }
  });
  it('pins the actual bundled geography without inventing an upstream dataset date',()=>{
    const bytes=readFileSync('public/presentation/countries.geojson');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(NATURAL_EARTH_BASEMAP.sha256);
    expect(JSON.parse(bytes.toString()).features).toHaveLength(177);
  });
});
