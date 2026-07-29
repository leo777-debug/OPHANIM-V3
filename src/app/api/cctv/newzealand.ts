import { stealthFetch } from '@/lib/stealthFetch';

/**
 * OSIRIS — New Zealand CCTV Cameras (Waka Kotahi / NZ Transport Agency)
 * Source: https://trafficnz.info/service/traffic/rest/4/cameras/all  (open XML)
 * ~300 state-highway cameras with coordinates — NO API KEY NEEDED.
 */

export async function fetchNewZealandCameras(): Promise<any[]> {
  try {
    const res = await stealthFetch('https://trafficnz.info/service/traffic/rest/4/cameras/all', {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const cams: any[] = [];

    // Each <camera> block has journey start/end lat (startLatitude/endLatitude) AND
    // a camera-level <latitude>/<longitude> — the plain tag is the camera position.
    for (const block of xml.split('<camera>').slice(1)) {
      if (/<offline>true<\/offline>/.test(block)) continue;
      const lat = block.match(/<latitude>([-\d.]+)<\/latitude>/);
      const lng = block.match(/<longitude>([-\d.]+)<\/longitude>/);
      const img = block.match(/<imageUrl>([^<]+)<\/imageUrl>/);
      const desc = block.match(/<description>([^<]+)<\/description>/);
      const region = block.match(/<region>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/region>/);
      if (!lat || !lng || !img) continue;

      const idm = img[1].match(/(\d+)/);
      cams.push({
        id: `nz-${idm ? idm[1] : cams.length}`,
        lat: parseFloat(lat[1]),
        lng: parseFloat(lng[1]),
        name: desc ? desc[1].trim() : 'NZ Highway Cam',
        city: region ? region[1].trim() : 'New Zealand',
        country: 'New Zealand',
        feed_url: `https://trafficnz.info${img[1]}`,
        source: 'NZTA',
      });
    }

    return cams;
  } catch {
    return [];
  }
}
