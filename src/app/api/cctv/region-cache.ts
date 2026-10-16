import type { CctvCamera } from './types';

// Shared with the existing bounded background warmer. Presentation reads the
// completed regions instead of waiting for the slowest worldwide directory.
export const regionCache = new Map<string, { cams: CctvCamera[]; at: number }>();
export function publicCameraSnapshot(now = Date.now()) {
  const cameras = new Map<string, CctvCamera>();
  for (const region of regionCache.values()) {
    if (now-region.at > 15*60*1000) continue;
    for (const camera of region.cams) cameras.set(camera.id,camera);
  }
  return { cameras:[...cameras.values()] };
}
