'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Bookmark, Plus, Trash2, X } from 'lucide-react';
import { readWatchlistNotifications, readWatchlists, writeWatchlistNotifications, writeWatchlists } from '@/lib/watchlists/client-store';
import { didWatchlistChange, snapshotResults } from '@/lib/watchlists/snapshot';
import { WATCHLIST_TYPES, type WatchlistCheckResponse, type WatchlistItem, type WatchlistNotification, type WatchlistType } from '@/lib/watchlists/types';

const LABELS: Record<WatchlistType, string> = { ip: 'IP', domain: 'Domain', ship: 'Ship', port: 'Port', company: 'Company', threat_actor: 'Threat actor', region: 'Region', country: 'Country' };

export default function WatchlistPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [notifications, setNotifications] = useState<WatchlistNotification[]>([]);
  const [type, setType] = useState<WatchlistType>('ip');
  const [value, setValue] = useState('');

  useEffect(() => { setItems(readWatchlists()); setNotifications(readWatchlistNotifications()); }, []);
  const persistItems = useCallback((next: WatchlistItem[]) => { setItems(next); writeWatchlists(next); }, []);
  const persistNotifications = useCallback((next: WatchlistNotification[]) => { setNotifications(next); writeWatchlistNotifications(next); }, []);

  const checkItem = useCallback(async (item: WatchlistItem) => {
    const response = await fetch('/api/watchlists/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: item.type, value: item.value }) });
    if (!response.ok) return;
    const data = await response.json() as WatchlistCheckResponse;
    const snapshot = snapshotResults(data.results);
    const changed = didWatchlistChange(item.snapshot, snapshot);
    const updated = { ...item, snapshot, lastCheckedAt: new Date().toISOString() };
    setItems((current) => { const next = current.map((candidate) => candidate.id === item.id ? updated : candidate); writeWatchlists(next); return next; });
    if (changed) {
      const notification: WatchlistNotification = { id: crypto.randomUUID(), watchlistId: item.id, title: `${item.label} updated`, detail: `${data.results.length} provider record${data.results.length === 1 ? '' : 's'} changed`, createdAt: new Date().toISOString(), read: false };
      setNotifications((current) => { const next = [notification, ...current]; writeWatchlistNotifications(next); return next; });
      if (item.browserNotifications && Notification.permission === 'granted') new Notification(notification.title, { body: notification.detail });
    }
  }, []);

  useEffect(() => {
    const tick = () => items.filter((item) => item.enabled).filter((item) => !item.lastCheckedAt || Date.now() - Date.parse(item.lastCheckedAt) >= item.intervalMinutes * 60_000).forEach((item) => { void checkItem(item); });
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [items, checkItem]);

  const add = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    persistItems([{ id: crypto.randomUUID(), type, value: trimmed, label: trimmed, enabled: true, intervalMinutes: 5, browserNotifications: false }, ...items]);
    setValue('');
  };
  const unread = useMemo(() => notifications.filter((notification) => !notification.read).length, [notifications]);

  return <div className="fixed left-3 top-1/2 -translate-y-1/2 z-[260] pointer-events-auto">
    <button onClick={() => setOpen((current) => !current)} title="Watchlists" className="relative w-9 h-9 flex items-center justify-center glass-panel hover:border-[var(--gold-primary)]"><Bookmark className="w-4 h-4 text-[var(--gold-primary)]" />{unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-[var(--alert-red)] text-[7px] text-black font-bold">{unread}</span>}</button>
    {open && <section className="absolute left-11 top-0 w-[320px] max-h-[70vh] overflow-y-auto glass-panel p-3">
      <header className="flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-heading)]"><Bell className="w-3.5 h-3.5 text-[var(--gold-primary)]" />WATCHLISTS</div><button onClick={() => setOpen(false)} title="Close watchlists"><X className="w-3.5 h-3.5" /></button></header>
      <div className="grid grid-cols-[100px_1fr_auto] gap-2 mt-3"><select value={type} onChange={(event) => setType(event.target.value as WatchlistType)} className="bg-[var(--bg-tertiary)] text-[10px] font-mono"><>{WATCHLIST_TYPES.map((entry) => <option key={entry} value={entry}>{LABELS[entry]}</option>)}</></select><input value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') add(); }} placeholder="Value to monitor" className="min-w-0 bg-[var(--bg-tertiary)] px-2 text-[10px] font-mono" /><button onClick={add} title="Add watchlist item"><Plus className="w-4 h-4 text-[var(--alert-green)]" /></button></div>
      <div className="mt-3 space-y-2">{items.map((item) => <div key={item.id} className="border border-[var(--border-secondary)] p-2"><div className="flex items-start gap-2"><input type="checkbox" checked={item.enabled} onChange={() => persistItems(items.map((candidate) => candidate.id === item.id ? { ...candidate, enabled: !candidate.enabled } : candidate))} /><div className="min-w-0 flex-1"><div className="text-[10px] font-mono text-[var(--text-primary)] truncate">{item.label}</div><div className="text-[8px] font-mono text-[var(--text-muted)] uppercase">{LABELS[item.type]} | {item.lastCheckedAt ? 'checked' : 'pending'}</div></div><button onClick={() => persistItems(items.filter((candidate) => candidate.id !== item.id))} title="Remove watchlist item"><Trash2 className="w-3 h-3 text-[var(--alert-red)]" /></button></div><div className="flex items-center justify-between mt-2"><label className="text-[8px] font-mono text-[var(--text-muted)]">Every <select value={item.intervalMinutes} onChange={(event) => persistItems(items.map((candidate) => candidate.id === item.id ? { ...candidate, intervalMinutes: Number(event.target.value) } : candidate))} className="bg-transparent"><option value={5}>5 min</option><option value={15}>15 min</option><option value={60}>60 min</option></select></label><button onClick={() => { if (Notification.permission === 'default') void Notification.requestPermission(); persistItems(items.map((candidate) => candidate.id === item.id ? { ...candidate, browserNotifications: !candidate.browserNotifications } : candidate)); }} className={`text-[8px] font-mono ${item.browserNotifications ? 'text-[var(--alert-green)]' : 'text-[var(--text-muted)]'}`}>NOTIFY</button></div></div>)}</div>
      {notifications.length > 0 && <div className="mt-4 border-t border-[var(--border-secondary)] pt-2"><div className="text-[8px] font-mono text-[var(--text-muted)]">UPDATES</div>{notifications.slice(0, 8).map((notification) => <button key={notification.id} onClick={() => persistNotifications(notifications.map((candidate) => candidate.id === notification.id ? { ...candidate, read: true } : candidate))} className="w-full text-left mt-2 text-[9px] font-mono"><span className={notification.read ? 'text-[var(--text-muted)]' : 'text-[var(--gold-primary)]'}>{notification.title}</span><div className="text-[8px] text-[var(--text-muted)]">{notification.detail}</div></button>)}</div>}
    </section>}
  </div>;
}
