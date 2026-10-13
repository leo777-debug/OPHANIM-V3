import { NextRequest } from 'next/server';
import { parseWithOptionalAi } from '@/lib/verify/ai';
import { parseClaimText } from '@/lib/verify/claim';
import { fetchArticle } from '@/lib/verify/url-fetch';
import { errorResponse, jsonResponse, readBody, requestContext } from '@/lib/verify/http';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try { const { owner } = await requestContext(request, true); const body = await readBody(request);
    const text = typeof body.text === 'string' ? body.text : '';
    parseClaimText(text);
    let articleText = '', warning = '';
    if (body.url) {
      if (body.urlPermission !== true) throw new Error('Confirm permission to retrieve this article.');
      try { articleText = (await fetchArticle(String(body.url))).text; } catch (error) { warning = error instanceof Error ? error.message : 'Article unavailable.'; }
    }
    const parsed = body.useAi === true ? await parseWithOptionalAi(text, body.aiConfig, articleText) : { claim: parseClaimText(text), parser: 'rules', warning: '' };
    parsed.warning = [parsed.warning, warning].filter(Boolean).join(' ');
    return jsonResponse(parsed, owner);
  } catch (error) { return errorResponse(error); }
}
