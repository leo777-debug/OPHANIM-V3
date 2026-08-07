'use client';

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plane, Satellite, Sun, AlertTriangle, Camera,
  CloudLightning, Ship, Network, Database, Ghost,
  Flame, Tv, Radio, Mountain, Anchor, Radar
} from 'lucide-react';

interface LayerPanelProps {
  data: any;
  activeLayers: any;
  setActiveLayers: React.Dispatch<React.SetStateAction<any>>;
  isMobile?: boolean;
  theme?: 'core' | 'ghost';
  setTheme?: (theme: 'core' | 'ghost') => void;
}

const LAYER_GROUPS = [
  {
    label: 'SDK',
    fullLabel: 'OPHANIM SDK',
    icon: Database,
    layers: [
      { key: 'sdk_sea', label: 'Maritime Lines', dataKey: 'sdk_entities' },
    ],
  },
  {
    label: 'AVIATION',
    fullLabel: 'AVIATION',
    icon: Plane,
    layers: [
      { key: 'flights', label: 'Commercial', dataKey: 'commercial_flights' },
      { key: 'private', label: 'Private', dataKey: 'private_flights' },
      { key: 'jets', label: 'Private Jets', dataKey: 'private_jets' },
      { key: 'military', label: 'Military', dataKey: 'military_flights' },
    ],
  },
  {
    label: 'MARITIME',
    fullLabel: 'MARITIME',
    icon: Ship,
    layers: [
      { key: 'maritime', label: 'Ports · Chokepoints · Ships', dataKey: 'maritime_ships,maritime_ports,maritime_chokepoints' },
      { key: 'ship_cargo', label: 'Cargo Vessels', dataKey: 'maritime_ships', catKey: 'cargo' },
      { key: 'ship_tanker', label: 'Tankers', dataKey: 'maritime_ships', catKey: 'tanker' },
      { key: 'ship_passenger', label: 'Passenger / Ferry', dataKey: 'maritime_ships', catKey: 'passenger' },
      { key: 'ship_fishing', label: 'Fishing', dataKey: 'maritime_ships', catKey: 'fishing' },
      { key: 'ship_military', label: 'Naval / Military', dataKey: 'maritime_ships', catKey: 'military' },
    ],
  },
  {
    label: 'SPACE',
    fullLabel: 'SPACE TRACKING',
    icon: Satellite,
    layers: [
      { key: 'satellites', label: 'All Satellites', dataKey: 'satellites' },
      { key: 'sat_comms', label: 'Starlink / Comms', dataKey: 'satellites', catKey: 'comms' },
      { key: 'sat_military', label: 'Military / Intel', dataKey: 'satellites', catKey: 'military' },
      { key: 'sat_navigation', label: 'GPS / Navigation', dataKey: 'satellites', catKey: 'navigation' },
      { key: 'sat_earth', label: 'Earth Observation', dataKey: 'satellites', catKey: 'earth_obs' },
      { key: 'sat_science', label: 'Stations / Telescopes', dataKey: 'satellites', catKey: 'science' },
    ],
  },
  {
    label: 'SURVEIL',
    fullLabel: 'SURVEILLANCE',
    icon: Camera,
    layers: [
      { key: 'cctv', label: 'All Public Cameras', dataKey: 'cameras' },
      { key: 'camera_logistics', label: 'Logistics Cameras', dataKey: 'cameras', cameraScope: 'logistics' },
      { key: 'camera_transport', label: 'Official Transport Cameras', dataKey: 'cameras', cameraScope: 'transport' },
      { key: 'live_news', label: 'Live News Feeds', dataKey: 'live_feeds' },
      { key: 'news_intel', label: 'SIGINT News', dataKey: 'sigint_news' },
    ],
  },
  {
    label: 'HAZARD',
    fullLabel: 'NATURAL HAZARDS',
    icon: CloudLightning,
    layers: [
      { key: 'earthquakes', label: 'Earthquakes', dataKey: 'earthquakes' },
      { key: 'fires', label: 'Active Fires', dataKey: 'fires' },
      { key: 'weather', label: 'Severe Weather', dataKey: 'weather_events' },
    ],
  },
  {
    label: 'THREAT',
    fullLabel: 'THREATS & INTEL',
    icon: AlertTriangle,
    layers: [
      { key: 'infrastructure', label: 'Nuclear Facilities', dataKey: 'infrastructure' },
      { key: 'war_sanctions', label: 'GUR Shadow Fleet & Sanctions', dataKey: 'war_sanctions' },
      { key: 'global_incidents', label: 'Global Incidents', dataKey: 'gdelt' },
      { key: 'gps_jamming', label: 'GPS Jamming', dataKey: 'gps_jamming' },
    ],
  },
  {
    label: 'NETWORK',
    fullLabel: 'NETWORK INTEL',
    icon: Network,
    layers: [
      { key: 'malware', label: 'Live Malware', dataKey: 'malware_threats' },
    ],
  },
  {
    label: 'DISPLAY',
    fullLabel: 'DISPLAY',
    icon: Sun,
    layers: [
      { key: 'day_night', label: 'Day / Night Cycle', dataKey: '' },
      { key: 'terrain_3d', label: '3D Terrain & Buildings', dataKey: '' },
    ],
  },
];

/* ── Minimal Toggle Switch ── */
function ToggleSwitch({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative flex-shrink-0 cursor-pointer"
      style={{ width: 28, height: 14 }}
    >
      <div
        className="absolute inset-0 rounded-full transition-all duration-300"
        style={{
          background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
          border: active ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.12)',
          boxShadow: active ? '0 0 8px rgba(255,255,255,0.1)' : 'none',
        }}
      />
      <motion.div
        className="absolute top-[2px] rounded-full"
        style={{
          width: 10,
          height: 10,
          background: active ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.2)',
          boxShadow: active ? '0 0 6px rgba(255,255,255,0.4)' : 'none',
        }}
        animate={{ left: active ? 16 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

function LayerPanel({ data, activeLayers, setActiveLayers, isMobile, theme = 'core', setTheme }: LayerPanelProps) {
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);

  const toggle = (key: string) => setActiveLayers((prev: any) => ({ ...prev, [key]: !prev[key] }));

  const getCount = (dk: string, catKey?: string, cameraScope?: 'logistics' | 'transport'): number | null => {
    if (!dk) return null;
    if (cameraScope && dk === 'cameras' && Array.isArray(data.cameras)) {
      return data.cameras.filter((camera: any) => cameraScope === 'logistics'
        ? camera.operational_scope === 'logistics'
        : camera.official_public_source).length;
    }
    if (catKey && data.category_counts) {
      return data.category_counts[catKey] || 0;
    }
    let total = 0;
    let found = false;
    for (const k of dk.split(',')) {
      if (data[k] && Array.isArray(data[k])) {
        total += data[k].length;
        found = true;
      }
    }
    return found ? total : null;
  };

  /* ── MOBILE ── */
  if (isMobile) {
    return (
      <div className="flex flex-col gap-5 py-2">
        {LAYER_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-2">
            <div className="text-[9px] font-mono tracking-[0.2em] uppercase text-white/30 border-b border-white/[0.06] pb-1.5">
              {group.fullLabel}
            </div>
            <div className="flex flex-col gap-1">
              {group.layers.map((layer) => {
                const isLayerActive = activeLayers[layer.key];
                const count = getCount(
                  layer.dataKey,
                  'catKey' in layer ? layer.catKey : undefined,
                  'cameraScope' in layer ? layer.cameraScope as 'logistics' | 'transport' : undefined,
                );
                return (
                  <div key={layer.key} className="flex items-center gap-3 px-1 py-1.5">
                    <ToggleSwitch
                      active={!!isLayerActive}
                      onClick={() => toggle(layer.key)}
                    />
                    <span className={`text-[10px] font-mono uppercase tracking-wider flex-1 transition-colors ${isLayerActive ? 'text-white/80' : 'text-white/40'}`}>
                      {layer.label}
                    </span>
                    {count !== null && (
                      <span className="text-[8px] font-mono tabular-nums text-white/20">
                        {count.toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* MOBILE GHOST TOGGLE */}
        {setTheme && (
          <div className="flex items-center justify-between mt-2 pt-3 border-t border-white/[0.06] px-1">
            <span className="text-[9px] font-mono tracking-[0.2em] text-white/25 uppercase">Eclipse Mode</span>
            <button
              onClick={() => setTheme(theme === 'core' ? 'ghost' : 'core')}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
              style={{
                background: theme === 'ghost' ? 'rgba(179, 136, 255, 0.15)' : 'transparent',
                boxShadow: theme === 'ghost' ? '0 0 12px rgba(179, 136, 255, 0.3)' : 'none',
              }}
            >
              <Ghost className="w-4 h-4" style={{ color: theme === 'ghost' ? '#B388FF' : 'rgba(255,255,255,0.25)' }} />
            </button>
          </div>
        )}
      </div>
    );
  }

  /* ── DESKTOP ── */
  return (
    <motion.div
      initial={{ x: -60, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 30, stiffness: 200, delay: 2.8 }}
      className="ophanim-layer-dock absolute top-[132px] left-5 bottom-[74px] w-[60px] flex flex-col items-center px-1.5 pt-2 pb-2 z-50 pointer-events-auto"
      style={{
        background: 'rgba(10, 15, 20, 0.9)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '1px solid rgba(117,167,255,0.18)',
        boxShadow: '0 18px 44px rgba(0,0,0,0.38)',
      }}
    >
      <div className="mb-2 text-[7px] font-semibold tracking-[0.12em] text-white/45">MAP</div>
      <div className="flex-1 flex flex-col items-center gap-1">
        {LAYER_GROUPS.map((group) => {
          const groupActive = group.layers.some(l => activeLayers[l.key]);
          const isHovered = hoveredGroup === group.label;
          const Icon = group.icon;

          return (
            <div
              key={group.label}
              className="relative flex"
              onMouseEnter={() => setHoveredGroup(group.label)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              <button
                type="button"
                aria-label={`${group.fullLabel} layers`}
                title={`${group.fullLabel} layers`}
                className="h-10 w-10 flex items-center justify-center cursor-pointer rounded-lg transition-all duration-300"
                style={{
                  background: groupActive
                    ? 'rgba(48,211,195,0.14)'
                    : isHovered
                      ? 'rgba(255,255,255,0.05)'
                      : 'transparent',
                  boxShadow: groupActive ? 'inset 0 0 0 1px rgba(48,211,195,0.34)' : 'none',
                }}
              >
                <Icon
                  className="transition-all duration-300"
                  style={{
                    width: 16,
                    height: 16,
                    color: groupActive
                      ? 'var(--gold-primary)'
                      : isHovered
                        ? 'rgba(255,255,255,0.4)'
                        : 'rgba(255,255,255,0.2)',
                    filter: groupActive ? 'drop-shadow(0 0 8px rgba(124,255,203,0.35))' : 'none',
                  }}
                />
                <span className="sr-only">{group.label}</span>
                {groupActive && (
                  <span className="absolute left-0 w-[2px] h-5 bg-[var(--cyan-primary)] shadow-[0_0_10px_rgba(48,211,195,0.7)]" />
                )}
              </button>

              {/* Flyout (LEFT side) */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, x: -8, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, x: -4, filter: 'blur(2px)' }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute left-[58px] top-1/2 -translate-y-1/2 min-w-[250px] rounded-lg p-3 z-[100] pointer-events-auto"
                    style={{
                      background: 'rgba(12,18,22,0.98)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      boxShadow: '0 18px 48px rgba(0,0,0,0.52)',
                    }}
                  >
                    <div className="text-[9px] font-mono tracking-[0.2em] uppercase text-white/30 mb-2.5 pb-1.5 border-b border-white/[0.04]">
                      {group.fullLabel}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {group.layers.map((layer) => {
                        const isLayerActive = activeLayers[layer.key];
                        const count = getCount(
                          layer.dataKey,
                          'catKey' in layer ? layer.catKey : undefined,
                          'cameraScope' in layer ? layer.cameraScope as 'logistics' | 'transport' : undefined,
                        );

                        return (
                          <div
                            key={layer.key}
                            className="flex items-center gap-3 px-1 py-[5px] rounded-md hover:bg-white/[0.03] transition-colors cursor-pointer"
                            onClick={() => toggle(layer.key)}
                          >
                            <ToggleSwitch active={!!isLayerActive} onClick={() => {}} />
                            <span className={`text-[10px] font-mono uppercase tracking-wider flex-1 transition-colors duration-200 ${isLayerActive ? 'text-white/70' : 'text-white/35'}`}>
                              {layer.label}
                            </span>
                            {count !== null && (
                              <span className="text-[9px] font-mono tabular-nums text-white/20">
                                {count.toLocaleString()}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Subtle separator */}
      <div className="w-5 h-px bg-white/[0.08] my-2" />

      {/* Eclipse Mode Toggle */}
      {setTheme && (
        <button
          onClick={() => setTheme(theme === 'core' ? 'ghost' : 'core')}
          className="w-10 h-10 flex items-center justify-center rounded-md transition-all duration-500 cursor-pointer"
          style={{
            background: theme === 'ghost' ? 'rgba(170, 112, 255, 0.14)' : 'rgba(124,255,203,0.06)',
          }}
          title="Eclipse Mode"
        >
          <Ghost
            className="transition-all duration-500"
            style={{
              width: 15,
              height: 15,
              color: theme === 'ghost' ? '#AA70FF' : 'rgba(124,255,203,0.5)',
              filter: theme === 'ghost' ? 'drop-shadow(0 0 8px rgba(170, 112, 255, 0.5))' : 'drop-shadow(0 0 6px rgba(124,255,203,0.2))',
            }}
          />
          <span className="sr-only">Appearance</span>
        </button>
      )}
    </motion.div>
  );
}

export default memo(LayerPanel);
