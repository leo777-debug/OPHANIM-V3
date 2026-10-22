import { NextResponse } from 'next/server';
import { GET as getPublicNews } from '@/app/api/news/route';
import { buildConflictContext } from '@/lib/intelligence/conflict-context';
import type { FeedHealth, NewsItem } from '@/lib/intelligence/news';
export const dynamic = 'force-dynamic';

// Undated editorial reference areas inherited from Ophanim. These are not current event locations.
const KNOWN_CONFLICTS = [
  { id: 'ukraine', label: 'UKRAINE WAR', severity: 'war' as const, lat: 48.5, lng: 31.2, region: 'ukraine', 
    description: 'Ongoing Russian invasion of Ukraine — active frontlines across eastern and southern regions.',
    sourceUrl: 'https://liveuamap.com/',
    queries: ['ukraine war', 'ukraine attack', 'ukraine frontline'],
    bounds: { minLat: 44, maxLat: 53, minLng: 22, maxLng: 40 } },
  { id: 'gaza', label: 'GAZA CONFLICT', severity: 'war' as const, lat: 31.35, lng: 34.35, region: 'gaza',
    description: 'Active military operations and humanitarian crisis in Gaza Strip.',
    sourceUrl: 'https://israelpalestine.liveuamap.com/',
    queries: ['gaza attack', 'gaza airstrike', 'israel hamas'],
    bounds: { minLat: 31, maxLat: 32, minLng: 34, maxLng: 34.8 } },
  { id: 'lebanon', label: 'LEBANON BORDER', severity: 'high' as const, lat: 33.377, lng: 35.483, region: 'lebanon',
    description: 'Active cross-border military operations in southern Lebanon.',
    sourceUrl: 'https://lebanon.liveuamap.com/',
    queries: ['lebanon airstrike', 'hezbollah attack', 'lebanon military'],
    bounds: { minLat: 33, maxLat: 34.5, minLng: 35, maxLng: 36.5 } },
  { id: 'sudan', label: 'SUDAN CIVIL WAR', severity: 'war' as const, lat: 15.0, lng: 30.0, region: 'sudan',
    description: 'Armed conflict between SAF and RSF factions across Sudan.',
    sourceUrl: 'https://sudan.liveuamap.com/',
    queries: ['sudan war', 'sudan conflict', 'RSF SAF'],
    bounds: { minLat: 10, maxLat: 22, minLng: 22, maxLng: 38 } },
  { id: 'myanmar', label: 'MYANMAR CONFLICT', severity: 'war' as const, lat: 19.5, lng: 96.5, region: 'myanmar',
    description: 'Internal conflict — military junta vs opposition forces.',
    sourceUrl: 'https://myanmar.liveuamap.com/',
    queries: ['myanmar conflict', 'myanmar military', 'myanmar junta'],
    bounds: { minLat: 10, maxLat: 28, minLng: 92, maxLng: 101 } },
  { id: 'yemen', label: 'YEMEN WAR', severity: 'war' as const, lat: 15.5, lng: 48.0, region: 'yemen',
    description: 'Houthi militant operations, Red Sea maritime threats, and coalition strikes.',
    sourceUrl: 'https://yemen.liveuamap.com/',
    queries: ['yemen houthi', 'red sea attack', 'yemen strike'],
    bounds: { minLat: 12, maxLat: 20, minLng: 42, maxLng: 55 } },
  { id: 'syria', label: 'SYRIA', severity: 'high' as const, lat: 35.0, lng: 38.5, region: 'syria',
    description: 'Ongoing civil conflict and localized insurgencies.',
    sourceUrl: 'https://syria.liveuamap.com/',
    queries: ['syria attack', 'syria military', 'syria conflict'],
    bounds: { minLat: 32, maxLat: 37, minLng: 35, maxLng: 42 } },
  { id: 'drc', label: 'DRC EASTERN CONFLICT', severity: 'war' as const, lat: -1.0, lng: 28.5, region: 'drc',
    description: 'M23 rebel offensive and regional instability in eastern Congo.',
    sourceUrl: 'https://drc.liveuamap.com/',
    queries: ['congo conflict', 'M23 DRC', 'congo attack'],
    bounds: { minLat: -5, maxLat: 5, minLng: 25, maxLng: 32 } },
  { id: 'red-sea', label: 'RED SEA THREAT', severity: 'high' as const, lat: 16.0, lng: 40.0, region: 'red-sea',
    description: 'Houthi anti-ship missile and drone attacks on maritime traffic.',
    sourceUrl: 'https://yemen.liveuamap.com/',
    queries: ['red sea ship attack', 'houthi missile ship'],
    bounds: { minLat: 12, maxLat: 22, minLng: 36, maxLng: 44 } },
  { id: 'taiwan-strait', label: 'TAIWAN STRAIT', severity: 'elevated' as const, lat: 24.0, lng: 119.5, region: 'taiwan',
    description: 'Elevated military drills and regional tension.',
    sourceUrl: 'https://china.liveuamap.com/',
    queries: ['taiwan strait military', 'china taiwan'],
    bounds: { minLat: 22, maxLat: 26, minLng: 117, maxLng: 122 } },
  { id: 'korean-dmz', label: 'KOREAN DMZ', severity: 'elevated' as const, lat: 38.3, lng: 127.0, region: 'korea',
    description: 'Ongoing cross-border tension and military posturing.',
    sourceUrl: 'https://liveuamap.com/',
    queries: ['north korea military', 'korean dmz'],
    bounds: { minLat: 37, maxLat: 39.5, minLng: 124, maxLng: 130 } },
  { id: 'sahel', label: 'SAHEL INSTABILITY', severity: 'high' as const, lat: 14.0, lng: 5.0, region: 'sahel',
    description: 'Insurgencies and military coups across Mali, Burkina Faso, Niger.',
    sourceUrl: 'https://africa.liveuamap.com/',
    queries: ['sahel insurgency', 'mali burkina niger conflict'],
    bounds: { minLat: 10, maxLat: 20, minLng: -5, maxLng: 15 } },
  { id: 'somalia', label: 'SOMALIA', severity: 'high' as const, lat: 5.0, lng: 46.0, region: 'somalia',
    description: 'Al-Shabaab insurgency and counter-terrorism operations.',
    sourceUrl: 'https://africa.liveuamap.com/',
    queries: ['somalia al-shabaab', 'somalia attack'],
    bounds: { minLat: -2, maxLat: 12, minLng: 40, maxLng: 52 } },
  { id: 'iraq', label: 'IRAQ INSTABILITY', severity: 'elevated' as const, lat: 33.3, lng: 44.4, region: 'iraq',
    description: 'Ongoing militia activity and counter-terrorism operations.',
    sourceUrl: 'https://iraq.liveuamap.com/',
    queries: ['iraq militia', 'iraq attack', 'iraq isis'],
    bounds: { minLat: 29, maxLat: 37.5, minLng: 38, maxLng: 49 } },
  { id: 'ethiopia', label: 'ETHIOPIA', severity: 'elevated' as const, lat: 9.0, lng: 38.7, region: 'ethiopia',
    description: 'Ethnic tensions and regional conflicts across multiple regions.',
    sourceUrl: 'https://africa.liveuamap.com/',
    queries: ['ethiopia conflict', 'tigray amhara'],
    bounds: { minLat: 3, maxLat: 15, minLng: 33, maxLng: 48 } },
];

export async function GET() {
  try {
    const news = await getPublicNews();
    const body = await news.json() as { news?: NewsItem[]; news_sources?: FeedHealth[] };
    return NextResponse.json(buildConflictContext(KNOWN_CONFLICTS, body.news ?? [], body.news_sources ?? []), { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
  } catch {
    return NextResponse.json(buildConflictContext(KNOWN_CONFLICTS, [], []), { headers: { 'Cache-Control': 'no-store' } });
  }
}
