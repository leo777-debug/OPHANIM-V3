import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNTRY_GAZETTEER, COUNTRY_REFERENCE } from './country-gazetteer';
import { correlateEntities, extractEntities, whyItMatters } from './analysis';
import type { NewsItem } from './news';
describe('dated English / Arabic country and territory reference', () => {
  it('has 249 scoped stable identities with explicit rights/version and no coordinates', () => {
    expect(COUNTRY_GAZETTEER).toHaveLength(249); expect(new Set(COUNTRY_GAZETTEER.map(entry => entry.id)).size).toBe(249);
    expect(COUNTRY_REFERENCE).toMatchObject({ commercialUse: 'yes', keyNeeded: false, licence: 'Unicode License v3' });
    expect(COUNTRY_REFERENCE.version).toContain('CLDR 48.0'); expect(COUNTRY_REFERENCE.dateMeaning).toContain('generation');
    expect(readFileSync('public/reference/UNICODE-LICENSE.txt', 'utf8')).toContain('UNICODE LICENSE V3');
    expect(COUNTRY_GAZETTEER.every(entry => !('coordinates' in entry))).toBe(true);
  });
  it('recognizes broader English/Arabic labels and Arabic conjunctions/prepositions with stable identities', () => {
    const ids = extractEntities('Flood reports from Nigeria and Indonesia. تحذيرات في قطر والأرجنتين وبالإمارات.').map(entry => entry.id);
    expect(ids).toEqual(expect.arrayContaining(['country:NG', 'country:ID', 'country:QA', 'country:AR', 'country:AE']));
    expect(extractEntities('Cote d’Ivoire and Côte d’Ivoire').filter(entry => entry.id === 'country:CI')).toHaveLength(1);
    expect(extractEntities('United States and USA').filter(entry => entry.id === 'country:US')).toHaveLength(1);
  });
  it('withholds ambiguous bare labels instead of guessing from private names, finances or Amman', () => {
    expect(extractEntities('Chad and Jordan spoke with Georgia about a deal. تقرير مالي من عمان.')).toEqual([]);
    const ids = extractEntities('Hashemite Kingdom of Jordan; Republic of Chad; country of Georgia; سلطنة عمان; دولة مالي').map(entry => entry.id);
    expect(ids).toEqual(expect.arrayContaining(['country:JO', 'country:TD', 'country:GE', 'country:OM', 'country:ML']));
    expect(extractEntities('Please tell us about Ukrainian suppliers.')).toEqual([]);
  });
  it('uses longer country phrases without erasing separately mentioned shorter names', () => {
    expect(extractEntities('South Sudan and Equatorial Guinea').map(entry => entry.id)).toEqual(['country:GQ', 'country:SS']);
    expect(extractEntities('South Sudan and Sudan').map(entry => entry.id)).toEqual(['country:SD', 'country:SS']);
    expect(extractEntities('Equatorial Guinea and Guinea-Bissau').map(entry => entry.id)).toEqual(['country:GQ', 'country:GW']);
  });
  it('links translated country aliases across publishers without claiming an event location or impact', () => {
    const article = (id: string, title: string) => ({ id, title, description: '', source: id } as NewsItem);
    const linked = correlateEntities([article('publisher-one', 'Nigeria flood advisory'), article('publisher-two', 'تحذير من فيضان في نيجيريا')]);
    expect(linked.find(record => record.entity.id === 'country:NG')).toMatchObject({ articleIds: ['publisher-one', 'publisher-two'], publishers: ['publisher-one', 'publisher-two'] });
    expect(whyItMatters(article('one', 'Nigeria advisory'))).toMatchObject({ label: expect.stringContaining('INFERENCE'), text: expect.stringContaining('mention Nigeria') });
    expect(extractEntities('A private individual called Jane Example.').some(entity => entity.type === 'public_person')).toBe(false);
  });
});
