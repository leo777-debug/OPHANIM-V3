'use client';

import { Globe2, Plus, Target, X } from 'lucide-react';
import type { MapWorkspace } from '@/lib/map-workspaces';

type MapWorkspaceTabsProps = {
  workspaces: MapWorkspace[];
  activeWorkspaceId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClose: (id: string) => void;
  isMobile?: boolean;
};

export default function MapWorkspaceTabs({
  workspaces,
  activeWorkspaceId,
  onSelect,
  onCreate,
  onClose,
  isMobile = false,
}: MapWorkspaceTabsProps) {
  return (
    <nav
      className="ophanim-map-workspaces pointer-events-auto"
      aria-label="Map workspaces"
      style={{
        position: 'absolute',
        top: isMobile ? 158 : 88,
        right: isMobile ? 12 : 102,
        left: isMobile ? 12 : 336,
        zIndex: 260,
        minWidth: 0,
      }}
    >
      <div
        className="ophanim-map-workspaces__tabs"
        role="tablist"
        aria-label="Open globes"
        style={{
          display: 'flex',
          minWidth: 0,
          alignItems: 'center',
          gap: 4,
          overflowX: 'auto',
          border: '1px solid rgba(117, 167, 255, 0.24)',
          borderRadius: 7,
          background: 'rgba(8, 15, 18, 0.94)',
          boxShadow: '0 10px 28px rgba(0, 0, 0, 0.25)',
          padding: 4,
          backdropFilter: 'blur(16px)',
        }}
      >
        {workspaces.map((workspace) => {
          const isMain = workspace.id === 'main';
          const isActive = workspace.id === activeWorkspaceId;
          const Icon = workspace.target ? Target : Globe2;

          return (
            <div
              key={workspace.id}
              className={`ophanim-map-workspaces__tab ${isActive ? 'is-active' : ''}`}
              style={{
                display: 'inline-flex',
                flex: '0 0 auto',
                minWidth: 0,
                alignItems: 'center',
                border: `1px solid ${isActive ? 'rgba(48, 211, 195, 0.5)' : 'transparent'}`,
                borderRadius: 5,
                color: isActive ? 'var(--text-heading)' : 'var(--text-muted)',
                background: isActive ? 'rgba(48, 211, 195, 0.12)' : 'transparent',
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(workspace.id)}
                title={`Open ${workspace.label} globe`}
                style={{
                  display: 'inline-flex',
                  minWidth: 0,
                  height: 32,
                  alignItems: 'center',
                  gap: 6,
                  border: 0,
                  borderRadius: 4,
                  background: 'transparent',
                  padding: '0 10px',
                  color: 'inherit',
                  font: '800 9px var(--font-body)',
                  letterSpacing: '0.08em',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: isActive ? 'var(--cyan-primary)' : 'currentColor' }} />
                <span style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{workspace.label}</span>
              </button>
              {!isMain && (
                <button
                  type="button"
                  onClick={() => onClose(workspace.id)}
                  title={`Close ${workspace.label} globe`}
                  aria-label={`Close ${workspace.label} globe`}
                  style={{
                    display: 'grid',
                    width: 28,
                    height: 32,
                    placeItems: 'center',
                    border: 0,
                    borderRadius: 4,
                    background: 'transparent',
                    color: 'var(--text-muted)',
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="ophanim-map-workspaces__new"
          onClick={onCreate}
          title="Open a new globe workspace"
          aria-label="Open a new globe workspace"
          style={{
            display: 'inline-flex',
            flex: '0 0 auto',
            height: 32,
            alignItems: 'center',
            gap: 6,
            marginLeft: 2,
            border: '1px solid rgba(48, 211, 195, 0.3)',
            borderRadius: 4,
            background: 'transparent',
            padding: '0 10px',
            color: 'var(--cyan-primary)',
            font: '800 9px var(--font-body)',
            letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          }}
        >
          <Plus className="h-4 w-4" />
          <span>NEW GLOBE</span>
        </button>
      </div>
    </nav>
  );
}
