import type { ProviderMapFeature } from '@/lib/providers/types';
import type { FeedHealth, NewsItem } from '@/lib/intelligence/news';

export type PresentationView = 'map' | 'full';
export type ReplayMode = 'auto' | 'on' | 'off';
export interface PresentationSettings {
  enabled: boolean;
  defaultView: PresentationView;
  replay: ReplayMode;
  verifyButton: boolean;
  pinRequired: boolean;
  revision: number;
  updatedAt: string | null;
}
export const DEFAULT_PRESENTATION: PresentationSettings = {
  enabled: false, defaultView: 'map', replay: 'auto', verifyButton: false,
  pinRequired: false, revision: 0, updatedAt: null,
};
// Verify has not been merged into the current default branch.
export const PRESENTATION_VERIFY_AVAILABLE = false;
export const VIEW_COOKIE = 'ophanim_presentation_view';
export type FeedId = 'flights' | 'maritime' | 'ports' | 'chokepoints' | 'cameras' | 'broadcasts' | 'conflicts' | 'infrastructure' | 'war-sanctions' | 'earthquakes' | 'fires' | 'weather' | 'satellites' | 'cables' | 'incidents' | 'cyber' | 'news' | 'space-weather';
export interface PublicFeed {
  id: FeedId;
  features: ProviderMapFeature[];
  news: NewsItem[];
  sources: FeedHealth[];
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  observedAt: string | null;
  reference: boolean;
  note: string;
  testFixture?: boolean;
  /** Only the keyless maritime projector sets this; legacy mixed snapshots are rejected. */
  publicOnly?: boolean;
}
export interface PresentationFeed extends PublicFeed {
  state: 'live' | 'replay' | 'reference' | 'unavailable';
  recordedAt: string | null;
}
