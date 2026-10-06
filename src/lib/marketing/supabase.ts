type MarketingTable = 'ophanim_access_requests' | 'ophanim_feedback';

export async function insertMarketingRecord(table: MarketingTable, record: Record<string, string | null>) {
  const baseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) throw new Error('Supabase marketing form configuration is missing.');

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(record),
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase insert failed (${response.status}): ${detail.slice(0, 300)}`);
  }
}
