'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Share2, Copy, Check, Link2, X, Globe, MapPin } from 'lucide-react';
import { publicMapViewUrl } from '@/lib/map/view-url';
import type { MapProjection, MapStyle } from '@/lib/map-workspaces';

interface SharePanelProps {
  mapView: { zoom: number; latitude: number; longitude: number };
  activeLayers: Record<string, boolean>;
  mouseCoords?: { lat: number; lng: number } | null;
  projection?: MapProjection;
  mapStyle?: MapStyle;
}

export default function SharePanel({ mapView, activeLayers, projection = 'globe', mapStyle = 'dark' }: SharePanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  const share = useMemo(() => {
    try { return { url: publicMapViewUrl(typeof window !== 'undefined' ? window.location.origin : 'https://ophanim.live', { viewport: mapView, activeLayers, projection, mapStyle }), error: '' }; }
    catch (error) { return { url: '', error: error instanceof Error ? error.message : 'Public view sharing unavailable.' }; }
  }, [mapView, activeLayers, projection, mapStyle]);

  const copyToClipboard = useCallback(async () => {
    const url = share.url;
    if (!url) return;
    setCopyError('');
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Clipboard unavailable. Select and copy the public URL field.');
    }
  }, [share.url]);

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key === 's' && !e.ctrlKey && !e.metaKey && !e.altKey && !target?.isContentEditable && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) {
        e.preventDefault();
        setIsOpen(p => !p);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* Share Button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        className="glass-panel w-8 h-8 flex items-center justify-center pointer-events-auto hover:border-[var(--gold-primary)] transition-colors"
        title="Share view (S)"
        aria-label="Share public map settings"
      >
        <Share2 className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
      </motion.button>

      {/* Share Panel */}
      {typeof document !== 'undefined' && createPortal(<AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            role="dialog" aria-label="Public map sharing"
            className="fixed top-[140px] right-3 w-[min(360px,calc(100vw-24px))] glass-panel p-4 pointer-events-auto ophanim-glow z-[600]"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-[var(--gold-primary)]" />
                <span className="hud-text text-[10px] text-[var(--text-primary)]">SHARE VIEW</span>
              </div>
              <button type="button" aria-label="Close map sharing" onClick={() => setIsOpen(false)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Current View Info */}
            <div className="mb-3 p-2 rounded-lg bg-[var(--bg-void)] border border-[var(--border-primary)]">
              <div className="flex items-center gap-1.5 mb-1">
                <MapPin className="w-2.5 h-2.5 text-[var(--gold-primary)]" />
                <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-widest">CURRENT VIEW</span>
              </div>
              <div className="text-[8px] font-mono text-[var(--text-secondary)]">
                {`${mapView.latitude.toFixed(4)}°, ${mapView.longitude.toFixed(4)}°`} · Zoom {mapView.zoom.toFixed(1)} · {projection} · {mapStyle}
              </div>
              <div className="text-[7px] font-mono text-[var(--text-muted)] mt-1">
                {Object.values(activeLayers).filter(Boolean).length} layers active
              </div>
            </div>

            {/* Share URL */}
            <div className="mb-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Link2 className="w-2.5 h-2.5 text-[var(--text-muted)]" />
                <span className="text-[7px] font-mono text-[var(--text-muted)] tracking-widest">SHAREABLE LINK</span>
              </div>
              <div className="flex gap-1.5">
                <input aria-label="Public map view URL" readOnly value={share.url} className="min-w-0 flex-1 p-1.5 rounded bg-[var(--bg-void)] border border-[var(--border-primary)] text-[11px] font-mono text-[var(--gold-primary)]" />
                <button
                  onClick={copyToClipboard}
                  type="button" aria-label="Copy public map view URL" disabled={!share.url}
                  className={`px-3 py-1.5 rounded text-[7px] font-mono tracking-widest transition-all ${copied ? 'bg-[var(--alert-green)]/20 text-[var(--alert-green)] border border-[var(--alert-green)]/30' : 'bg-[var(--gold-primary)]/10 text-[var(--gold-primary)] border border-[var(--gold-primary)]/30 hover:bg-[var(--gold-primary)]/20'}`}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
            {share.error && <p role="status" className="text-xs">{share.error} Turn off private/unreviewed layers to create a public settings link. Private snapshot sharing is not implemented.</p>}
            {copyError && <p role="status" className="text-xs">{copyError}</p>}
            <p className="text-xs mb-3">This link restores public display settings and loads current source data. It is not a timestamped data snapshot or replay. Private records and entity identifiers are not included.</p>

            {/* Quick Share */}
            {share.url && <div className="flex gap-2">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('OPHANIM public map settings')}&url=${encodeURIComponent(share.url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-1.5 rounded text-[7px] font-mono tracking-wider text-[var(--text-muted)] border border-[var(--border-primary)] hover:border-[#1DA1F2] hover:text-[#1DA1F2] transition-colors"
              >
                𝕏 POST
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(share.url)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-1.5 rounded text-[7px] font-mono tracking-wider text-[var(--text-muted)] border border-[var(--border-primary)] hover:border-[#0A66C2] hover:text-[#0A66C2] transition-colors"
              >
                IN SHARE
              </a>
              <a
                href={`https://reddit.com/submit?url=${encodeURIComponent(share.url)}&title=${encodeURIComponent('OPHANIM public map settings')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center py-1.5 rounded text-[7px] font-mono tracking-wider text-[var(--text-muted)] border border-[var(--border-primary)] hover:border-[#FF4500] hover:text-[#FF4500] transition-colors"
              >
                REDDIT
              </a>
            </div>}

            <div className="mt-3 text-center text-[6px] font-mono text-[var(--text-muted)] tracking-widest">
              PRESS [S] TO TOGGLE · SHAREABLE LINKS PRESERVE VIEW STATE
            </div>
          </motion.div>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
}
