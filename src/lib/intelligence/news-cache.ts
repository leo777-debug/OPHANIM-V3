import { ResilientFeed } from '@/lib/providers/resilient-feed';
export type CachedArticle = {
  title: string; description: string; link: string; pubDate: string | null; source: string;
  coords?: [number, number]; sourcePolicy?: { reliability: string; purpose: string };
};
export const newsFeedCache = new ResilientFeed<CachedArticle[]>({ ttlMs: 300000, retries: 1 });
