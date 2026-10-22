type MarketingTable = 'ophanim_access_requests' | 'ophanim_feedback';

export class MarketingSubmissionError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'MarketingSubmissionError';
  }
}

export async function insertMarketingRecord(table: MarketingTable, record: Record<string, string | null>) {
  const baseUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
  const publishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)?.trim();
  if (!baseUrl || !publishableKey || publishableKey.startsWith('sb_secret_')) {
    throw new MarketingSubmissionError('Submissions are temporarily unavailable. Please try again later.', 503);
  }

  const headers: Record<string, string> = { apikey: publishableKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  // Legacy anon keys are JWTs. Modern publishable keys belong in apikey only.
  if (publishableKey.startsWith('eyJ')) headers.Authorization = `Bearer ${publishableKey}`;
  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/v1/${table}`, {
      method: 'POST', headers, body: JSON.stringify(record), cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MarketingSubmissionError('We could not save your submission. Please try again.', 503);
  }
  if (!response.ok) {
    // Do not log database response bodies: they can contain submitted personal data.
    console.error('Marketing submission storage failed', { table, status: response.status });
    throw new MarketingSubmissionError('We could not save your submission. Please try again.', 503);
  }
}
