import type { NormalizedSearchResult } from '@/lib/providers';

export const WATCHLIST_TYPES = ['ip', 'domain', 'ship', 'port', 'company', 'threat_actor', 'region', 'country'] as const;
export type WatchlistType = (typeof WATCHLIST_TYPES)[number];

export interface WatchlistItem {
  id: string;
  type: WatchlistType;
  value: string;
  label: string;
  enabled: boolean;
  intervalMinutes: number;
  browserNotifications: boolean;
  lastCheckedAt?: string;
  snapshot?: string;
}

export interface WatchlistCheckResponse {
  results: NormalizedSearchResult[];
  coverage: 'available' | 'unavailable';
}

export interface WatchlistNotification {
  id: string;
  watchlistId: string;
  title: string;
  detail: string;
  createdAt: string;
  read: boolean;
}
