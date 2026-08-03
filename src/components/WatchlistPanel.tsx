'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Bookmark, Plus, Trash2, X } from 'lucide-react';

type WatchlistItem = {
  id: string;
  public_id: string;
  entity_type: string;
  entity_value: string;
  label: string | null;
};

const entityTypes = ['ip', 'domain', 'ship', 'port', 'company', 'threat_actor', 'region', 'country'];

async function errorMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === 'string' ? body.error : fallback;
}

export default function WatchlistPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [entityType, setEntityType] = useState('ip');
  const [entityValue, setEntityValue] = useState('');
  const [email, setEmail] = useState('');
  const [alertMode, setAlertMode] = useState<'immediate' | 'digest'>('digest');
  const [digestMinutes, setDigestMinutes] = useState<30 | 60>(30);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/watchlists');
      if (!response.ok) {
        setMessage(await errorMessage(response, 'Watchlists are temporarily unavailable.'));
        return;
      }

      const body = await response.json();
      setItems(Array.isArray(body.watchlists) ? body.watchlists : []);
    } catch {
      setMessage('Unable to reach the watchlist service.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openWatchlists = useCallback(() => {
    setOpen(true);
    void load();
  }, [load]);

  useEffect(() => {
    window.addEventListener('ophanim:open-watchlists', openWatchlists);
    return () => window.removeEventListener('ophanim:open-watchlists', openWatchlists);
  }, [openWatchlists]);

  const addWatchlist = async () => {
    const value = entityValue.trim();
    if (!value) {
      setMessage('Enter an entity to watch.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: entityType, value }),
      });

      if (!response.ok) {
        setMessage(await errorMessage(response, 'Unable to save this watchlist.'));
        return;
      }

      setEntityValue('');
      setMessage('Watchlist saved.');
      await load();
    } catch {
      setMessage('Unable to reach the watchlist service.');
    } finally {
      setSubmitting(false);
    }
  };

  const removeWatchlist = async (id: string) => {
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(`/api/watchlists/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        setMessage(await errorMessage(response, 'Unable to remove this watchlist.'));
        return;
      }

      setMessage('Watchlist removed.');
      await load();
    } catch {
      setMessage('Unable to reach the watchlist service.');
    } finally {
      setSubmitting(false);
    }
  };

  const subscribe = async (id: string) => {
    if (!email.trim()) {
      setMessage('Enter an email address before enabling alerts.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(`/api/watchlists/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          mode: alertMode,
          digestMinutes: alertMode === 'digest' ? digestMinutes : undefined,
        }),
      });

      setMessage(
        response.ok
          ? 'Verification email sent. Confirm it to activate alerts.'
          : await errorMessage(response, 'Email alerts could not be configured.'),
      );
    } catch {
      setMessage('Unable to reach the email service.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false);
          } else {
            openWatchlists();
          }
        }}
        title="Watchlists"
        aria-label="Open watchlists"
        className="fixed left-3 top-1/2 z-[840] flex h-9 w-9 -translate-y-1/2 items-center justify-center glass-panel transition-colors hover:border-[var(--gold-primary)]"
      >
        <Bookmark className="h-4 w-4 text-[var(--gold-primary)]" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close watchlists"
            className="fixed inset-0 z-[845] cursor-default bg-black/20"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Watchlists"
            className="fixed left-1/2 top-[112px] z-[850] flex max-h-[calc(100dvh-136px)] w-[min(400px,calc(100vw-24px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-[var(--border-secondary)] bg-[var(--bg-primary)]/95 shadow-2xl backdrop-blur-xl md:top-[108px]"
          >
            <header className="flex items-center justify-between border-b border-[var(--border-secondary)] px-4 py-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-mono tracking-[0.16em] text-[var(--text-primary)]">
                  <Bell className="h-4 w-4 text-[var(--gold-primary)]" />
                  WATCHLISTS
                </p>
                <p className="mt-1 text-[10px] text-[var(--text-muted)]">Monitor entities and receive verified alerts.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                title="Close watchlists"
                className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white/5 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 overflow-y-auto p-4 styled-scrollbar">
              <div className="grid grid-cols-[108px_minmax(0,1fr)_36px] gap-2">
                <select
                  value={entityType}
                  onChange={(event) => setEntityType(event.target.value)}
                  aria-label="Entity type"
                  className="rounded-md border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-2 text-xs text-[var(--text-primary)]"
                >
                  {entityTypes.map((type) => (
                    <option key={type} value={type}>{type.replace('_', ' ')}</option>
                  ))}
                </select>
                <input
                  value={entityValue}
                  onChange={(event) => setEntityValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void addWatchlist();
                  }}
                  placeholder="Entity to monitor"
                  className="min-w-0 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => void addWatchlist()}
                  disabled={submitting}
                  title="Save watchlist"
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--gold-primary)]/50 text-[var(--gold-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_132px] gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email for alerts"
                  className="min-w-0 rounded-md border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-3 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
                <select
                  value={alertMode === 'immediate' ? 'immediate' : String(digestMinutes)}
                  onChange={(event) => {
                    if (event.target.value === 'immediate') {
                      setAlertMode('immediate');
                    } else {
                      setAlertMode('digest');
                      setDigestMinutes(Number(event.target.value) as 30 | 60);
                    }
                  }}
                  aria-label="Alert delivery schedule"
                  className="rounded-md border border-[var(--border-secondary)] bg-[var(--bg-tertiary)] px-2 text-xs text-[var(--text-primary)]"
                >
                  <option value="immediate">Immediate</option>
                  <option value="30">30 minute digest</option>
                  <option value="60">60 minute digest</option>
                </select>
              </div>

              {message && <p className="mt-3 text-xs text-[var(--text-secondary)]" role="status">{message}</p>}

              <div className="mt-4 space-y-2 border-t border-[var(--border-secondary)] pt-3">
                {loading ? (
                  <p className="text-xs text-[var(--text-muted)]">Loading watchlists...</p>
                ) : items.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No entities are being watched yet.</p>
                ) : (
                  items.map((item) => (
                    <article key={item.id} className="rounded-lg border border-[var(--border-secondary)] bg-black/10 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <a href={`/watchlists/${item.public_id}`} className="block truncate text-xs font-mono text-[var(--text-primary)] hover:text-[var(--gold-primary)]">
                            {item.label || item.entity_value}
                          </a>
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{item.entity_type.replace('_', ' ')}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeWatchlist(item.id)}
                          disabled={submitting}
                          title={`Remove ${item.entity_value} from watchlists`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--alert-red)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void subscribe(item.id)}
                        disabled={submitting}
                        className="mt-3 text-[10px] font-mono tracking-wide text-[var(--alert-green)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ENABLE EMAIL ALERTS
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
