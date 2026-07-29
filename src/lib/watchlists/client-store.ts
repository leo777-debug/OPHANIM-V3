import type { WatchlistItem, WatchlistNotification } from './types';

const ITEMS_KEY = 'ophanim-watchlists';
const NOTIFICATIONS_KEY = 'ophanim-watchlist-notifications';

function read<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]; } catch { return []; }
}

export function readWatchlists(): WatchlistItem[] { return read<WatchlistItem>(ITEMS_KEY); }
export function writeWatchlists(items: WatchlistItem[]): void { localStorage.setItem(ITEMS_KEY, JSON.stringify(items)); }
export function readWatchlistNotifications(): WatchlistNotification[] { return read<WatchlistNotification>(NOTIFICATIONS_KEY); }
export function writeWatchlistNotifications(items: WatchlistNotification[]): void { localStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(items.slice(0, 100))); }
