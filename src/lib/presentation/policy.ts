import type { PresentationSettings, PresentationView } from './types';

export function resolvePresentationView(settings: PresentationSettings, requested: string | null, cookie: string | undefined, unlocked: boolean): PresentationView {
  const choice = requested === 'full' || requested === 'map' ? requested
    : cookie?.startsWith('full') ? 'full' : cookie === 'map' ? 'map' : settings.defaultView;
  return choice === 'full' && settings.pinRequired && !unlocked ? 'map' : choice;
}

export function presentationDestination(path: string, settings: PresentationSettings, view: PresentationView, adminLogin = false): string | null {
  // Public setup instructions contain no organization data or full-platform tools.
  if (path === '/docs/research-setup' || path === '/docs/sdk-setup') return null;
  if (!settings.enabled || path.startsWith('/api/') || path.startsWith('/admin') || (path === '/login' && adminLogin)) return null;
  if (path.startsWith('/presentation')) return view === 'full' && path === '/presentation' ? '/operations?view=full' : null;
  if (view === 'full') return null;
  if (path.startsWith('/verify') && settings.verifyButton) return null;
  return '/presentation';
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/operations';
  const url = new URL(value, 'https://ophanim.invalid');
  if (url.origin !== 'https://ophanim.invalid' || url.pathname.startsWith('/api/') || url.pathname.startsWith('/presentation')) return '/operations';
  url.searchParams.set('view', 'full');
  return url.pathname + url.search;
}

export function protectedPresentationApi(path: string, method: string, privateAisConfigured = false): boolean {
  if (path === '/api/maritime' && privateAisConfigured) return true;
  if (/\/cron$|^\/api\/logistics\/disruptions\/sync$/.test(path)) return false;
  if (path === '/api/sdk/ingest') return method === 'GET';
  return /^\/api\/(ai|platform|logistics|cyber|dark-web|imports|intelligence|knowledge)(\/|$)/.test(path) || path === '/api/sdk/stream';
}
