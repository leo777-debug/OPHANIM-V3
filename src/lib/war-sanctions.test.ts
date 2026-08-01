import { afterEach, describe, expect, it, vi } from 'vitest';
import { findWarSanctionsVessels, getWarSanctionsVessel } from './war-sanctions';

const listHtml = `
  <a href="https://war-sanctions.gur.gov.ua/en/transport/ships/561">
    <div>Vessel name</div><div>FRUNZE</div>
    <div>IMO</div><div>9263643</div>
    <div>Flag (Current)</div><div>unknown</div>
    <div>Vessel Type</div><div>Crude Oil Tanker</div>
    <div>Category</div><div>Sanctions evasion</div>
  </a>`;

const profileHtml = `
  <link rel="canonical" href="https://war-sanctions.gur.gov.ua/en/transport/shadow-fleet/561">
  <meta property="og:title" content="FRUNZE; IMO 9263643">
  <div>MMSI</div><a>123456789</a>
  <div class="long-text-multiline">Documented official source description.</div>
  <script>MapLibreWidget={"options":{},"geodata":[{"id":1,"lat":35.1,"lng":129.03,"title":"Busan"}]};</script>`;

afterEach(() => vi.unstubAllGlobals());

describe('War & Sanctions public-page parser', () => {
  it('finds a vessel from the public catalogue page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(listHtml, { status: 200 }))));
    const vessels = await findWarSanctionsVessels('FRUNZE');
    expect(vessels).toEqual(expect.arrayContaining([expect.objectContaining({ id: '561', name: 'FRUNZE', imo: '9263643' })]));
  });

  it('parses source-listed ports from a public vessel profile', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(profileHtml, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const vessel = await getWarSanctionsVessel('561', 'shadow-fleet');
    expect(vessel).toMatchObject({
      catalogue: 'shadow-fleet', name: 'FRUNZE', imo: '9263643', mmsi: '123456789', isShadowFleet: true,
      ports: [{ name: 'Busan', lat: 35.1, lng: 129.03 }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://war-sanctions.gur.gov.ua/en/transport/shadow-fleet/561',
      expect.any(Object),
    );
  });
});
