export type CctvStreamType = 'jpg' | 'hls' | 'iframe' | 'mjpeg' | 'mp4';

export type OperationalCameraCategory =
  | 'port_approach'
  | 'airport_access'
  | 'border_crossing'
  | 'freight_corridor'
  | 'canal_lock'
  | 'general_traffic';

export type OperationalCameraScope = 'logistics' | 'transport' | 'general';

export interface CctvCamera {
  id: string;
  lat: number;
  lng: number;
  name: string;
  city: string;
  country: string;
  /** Static image URL (MJPEG/JPG snapshot) */
  feed_url?: string;
  /** Live video stream (HLS .m3u8) or embed URL (YouTube/rtsp.me) */
  stream_url?: string;
  stream_type?: CctvStreamType;
  external_url?: string;
  source: string;
  /** Added by Ophanim after source collection; never asserted by the upstream provider. */
  operational_category?: OperationalCameraCategory;
  operational_scope?: OperationalCameraScope;
  operational_context?: string;
  official_public_source?: boolean;
}

export function normalizeFeedUrl(url: string): string {
  if (url.startsWith('pics/')) {
    return `http://free-webcambg.com/${url.split('?')[0]}`;
  }
  return url.split('?')[0];
}

export function inferStreamType(url: string): CctvStreamType {
  if (/\.m3u8(\?|$)/i.test(url)) return 'hls';
  if (/youtube\.com\/embed|youtube-nocookie\.com\/embed|rtsp\.me\/embed|ipcamlive\.com\/player|click2stream\.com|windy\.com\/webcams\/\d+\/embed/i.test(url)) {
    return 'iframe';
  }
  return 'jpg';
}
