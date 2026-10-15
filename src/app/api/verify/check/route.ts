import { NextRequest } from 'next/server';
import { verifyClaim } from '@/lib/verify/service';
import { summarizeWithOptionalAi } from '@/lib/verify/ai';
import { fetchArticle } from '@/lib/verify/url-fetch';
import { remember, readRun, saveRun } from '@/lib/verify/store';
import { errorResponse, jsonResponse, readBody, requestContext, VerifyHttpError } from '@/lib/verify/http';
import { authorizeAiRequest } from '@/lib/ai/access';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    const { actor, owner } = await requestContext(request, true); const body = await readBody(request);
    if (body.useAi === true) { const denied = await authorizeAiRequest(request); if (denied) return denied; }
    if (body.confirmed !== true) throw new VerifyHttpError('Review and confirm the parsed claim first.', 400);
    const previousId = typeof body.previousId === 'string' ? body.previousId : undefined;
    const previous = previousId ? await readRun(previousId, actor, owner) : null;
    if (previousId && !previous) throw new VerifyHttpError('Previous check not found in your history.', 404);
    const fixture = previous?.replay?.fixture ?? (typeof body.fixture === 'string' ? body.fixture : undefined);
    let article = null; let articleError = '';
    const inputUrl = previous?.inputUrl ?? (typeof body.url === 'string' ? body.url : '');
    if (inputUrl && !fixture) {
      if (!previous?.inputUrl && body.urlPermission !== true) throw new VerifyHttpError('Confirm permission to retrieve this article.', 400);
      try { article = await fetchArticle(inputUrl); } catch { articleError = 'Article unavailable.'; }
    }
    let result = await verifyClaim(previous?.claim ?? body.claim, { fixture, previousId });
    if (articleError) result.couldNotCheck.push({ source: 'Submitted article', reason: articleError });
    if (article) { result.checked.push(`Submitted article text retrieved at ${article.fetchedAt}; unverified, not independent proof`); }
    if (inputUrl && !fixture) result.inputUrl = inputUrl;
    if (body.useAi === true) result = await summarizeWithOptionalAi(result, body.aiConfig);
    const persisted = await saveRun(result, actor, article);
    remember(result, owner, article);
    return jsonResponse({ result, persisted, storageNotice: persisted ? '' : 'Temporary session only (30 minutes). Sign in with a configured database for persisted history.' }, owner);
  } catch (error) { return errorResponse(error); }
}
