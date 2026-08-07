'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, MapPin, Navigation, Building2, Globe2, Landmark } from 'lucide-react';
import type { NormalizedSearchResult, SearchAction } from '@/lib/providers/types';

/* ═══════════════════════════════════════════════════════════════
   OPHANIM — Enhanced Search / Locate Bar
   Street-level geocoding with intelligent zoom levels
   Ctrl+F / Cmd+F keyboard shortcut support
   ═══════════════════════════════════════════════════════════════ */

type SearchResult = NormalizedSearchResult;

interface SearchBarProps {
  onLocate: (lat: number, lng: number, zoom?: number) => void;
  onAction?: (action: SearchAction) => void;
  alwaysExpanded?: boolean;
}

// Icon for result type
function getResultIcon(type: string, category: string) {
  if (['house', 'building', 'address', 'shop', 'amenity', 'office'].includes(type) || category === 'building') {
    return <Building2 className="w-3 h-3 text-[var(--cyan-primary)] flex-shrink-0" />;
  }
  if (['road', 'street', 'highway', 'path'].includes(type) || category === 'highway') {
    return <Navigation className="w-3 h-3 text-[var(--alert-green)] flex-shrink-0" />;
  }
  if (['country', 'continent', 'state'].includes(type)) {
    return <Globe2 className="w-3 h-3 text-[var(--gold-primary)] flex-shrink-0" />;
  }
  if (['city', 'town', 'village', 'municipality'].includes(type)) {
    return <Landmark className="w-3 h-3 text-[#FF9500] flex-shrink-0" />;
  }
  return <MapPin className="w-3 h-3 text-[var(--gold-primary)] flex-shrink-0" />;
}

// Format label: keep it concise
function formatLabel(displayName: string): { primary: string; secondary: string } {
  const parts = displayName.split(',').map(s => s.trim());
  if (parts.length <= 1) return { primary: parts[0] || '', secondary: '' };
  return {
    primary: parts.slice(0, 2).join(', '),
    secondary: parts.slice(2, 4).join(', '),
  };
}

export default function SearchBar({ onLocate, onAction, alwaysExpanded = false }: SearchBarProps) {
  const [open, setOpen] = useState(alwaysExpanded);
  const [value, setValue] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Ctrl+F / Cmd+F keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 50);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    if (!open || alwaysExpanded) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, alwaysExpanded]);

  const handleSearch = useCallback(async (q: string) => {
    setValue(q);
    setSelectedIdx(-1);

    if (timerRef.current) clearTimeout(timerRef.current);
    if (q.trim().length < 2) { setResults([]); setMessage(''); return; }

    timerRef.current = setTimeout(async () => {
      const request = ++requestRef.current;
      setLoading(true);
      setMessage('');
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
        const data = await res.json() as { results?: SearchResult[]; error?: string };
        if (!res.ok) throw new Error(data.error || 'Search is temporarily unavailable.');
        if (request !== requestRef.current) return;
        const nextResults = Array.isArray(data.results) ? data.results : [];
        setResults(nextResults);
        if (!nextResults.length) setMessage('No matches found. Try a city, country, port, domain, vessel, or coordinates.');
      } catch (error) {
        if (request !== requestRef.current) return;
        setResults([]);
        setMessage(error instanceof Error ? error.message : 'Search is temporarily unavailable.');
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    }, 300);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleSelect = (r: SearchResult) => {
    if (r.action?.type === 'open_entity') {
      window.location.assign(r.action.href);
      return;
    }
    if (r.action) onAction?.(r.action);
    if (r.lat !== undefined && r.lng !== undefined) onLocate(r.lat, r.lng, r.zoomLevel);
    if (!alwaysExpanded) setOpen(false);
    setValue('');
    setResults([]);
    setMessage('');
    setSelectedIdx(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (alwaysExpanded) {
        setValue('');
        setResults([]);
        inputRef.current?.blur();
      } else {
        setOpen(false);
        setValue('');
        setResults([]);
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < results.length) {
        handleSelect(results[selectedIdx]);
      } else if (results.length > 0) {
        handleSelect(results[0]);
      }
    }
  };

  if (!open && !alwaysExpanded) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 glass-panel-sm px-3 py-2 text-[9px] font-mono tracking-[0.15em] text-[var(--text-muted)] hover:text-[var(--gold-primary)] hover:border-[var(--border-active)] transition-all hover:shadow-[0_0_12px_rgba(124,255,203,0.08)]"
      >
        <Search className="w-3 h-3" />
        CMD: LOCATE
      </button>
    );
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="ophanim-search-surface flex items-center gap-2 px-3 py-2.5 transition-all"
      >
        <Search className="w-3.5 h-3.5 text-[var(--gold-primary)] flex-shrink-0" />
        <input
          ref={inputRef}
          data-testid="global-search-input"
          value={value}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search IPs, domains, vessels, places, and live layers"
          className="flex-1 bg-transparent text-[11px] text-[var(--text-primary)] font-mono outline-none placeholder:text-[var(--text-muted)]"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <div className="w-3 h-3 border border-[var(--gold-primary)] border-t-transparent rounded-full animate-spin" />}
        <span className="text-[8px] text-[var(--text-muted)] font-mono opacity-70 hidden md:inline">CTRL+F</span>
        {(value || !alwaysExpanded) && (
          <button onClick={() => {
            if (alwaysExpanded) { setValue(''); setResults([]); }
            else { setOpen(false); setValue(''); setResults([]); }
            setMessage('');
          }} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div
          data-testid="global-search-results"
          className="absolute top-full left-0 right-0 mt-1 glass-panel overflow-hidden max-h-[320px] overflow-y-auto styled-scrollbar z-[9999]"
          style={{ boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 1px rgba(124,255,203,0.2)' }}
        >
          {results.map((r, i) => {
            const { primary, secondary } = formatLabel(r.label);
            const detail = r.summary || secondary;
            const isSelected = i === selectedIdx;
            return (
              <button
                key={i}
                onClick={() => handleSelect(r)}
                onMouseEnter={() => setSelectedIdx(i)}
                className={`w-full text-left px-3 py-2.5 transition-colors border-b border-[var(--border-secondary)] last:border-0 flex items-start gap-2.5 ${
                  isSelected ? 'bg-[rgba(124,255,203,0.08)]' : 'hover:bg-[var(--hover-accent)]'
                }`}
              >
                <div className="mt-0.5">{getResultIcon(r.type, r.category)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-[var(--text-primary)] font-mono truncate leading-tight">{primary}</div>
                  {detail && (
                    <div className="text-[8px] text-[var(--text-muted)] font-mono truncate mt-0.5">{detail}</div>
                  )}
                </div>
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="text-[7px] text-[var(--text-muted)] font-mono uppercase tracking-wider">
                    {r.type === 'coordinate' ? 'COORDS' : r.type}
                  </span>
                  {r.lat !== undefined && r.lng !== undefined && <span className="text-[7px] text-[var(--gold-primary)] font-mono opacity-40">Z{r.zoomLevel}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {message && !loading && (
        <div data-testid="global-search-message" className="absolute top-full left-0 right-0 mt-1 border border-[var(--border-secondary)] bg-[var(--bg-panel-solid)] px-3 py-2.5 text-[10px] text-[var(--text-secondary)] shadow-xl z-[9999]" role="status">
          {message}
        </div>
      )}
    </div>
  );
}
