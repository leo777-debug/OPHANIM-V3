import { stealthFetch } from '@/lib/stealthFetch';

/**
 * OSIRIS — Iceland CCTV Cameras (Vegagerðin / Icelandic Road & Coastal Administration)
 * Source: https://umferdin.is/en/cameras  (camera list embedded as __NEXT_DATA__)
 * ~160 road weather cameras with coordinates — NO API KEY NEEDED.
 */

export async function fetchIcelandCameras(): Promise<any[]> {
  try {
    const res = await stealthFetch('https://umferdin.is/en/cameras', {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];

    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!m) return [];

    const data = JSON.parse(m[1]);
    const cameras = data?.props?.pageProps?.cameras;
    if (!Array.isArray(cameras)) return [];

    const cams: any[] = [];
    for (const cam of cameras) {
      const coords = cam.coordinates;
      const img = cam.images?.[0]?.url;
      if (!coords || typeof coords.lat !== 'number' || typeof coords.lon !== 'number' || !img) continue;

      cams.push({
        id: `ice-${cam.id}`,
        lat: coords.lat,
        lng: coords.lon,
        name: cam.name || 'Iceland Road Cam',
        city: cam.roadName || 'Iceland',
        country: 'Iceland',
        feed_url: img,
        source: 'Vegagerðin',
      });
    }

    return cams;
  } catch {
    return [];
  }
}
