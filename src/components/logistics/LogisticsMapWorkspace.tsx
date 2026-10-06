"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Check,
  ChevronRight,
  ExternalLink,
  Globe2,
  Layers3,
  LockKeyhole,
  MapPinned,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProviderMapLayer } from "@/lib/providers";
import type { DisruptionRecord } from "@/lib/logistics/disruptions";
import type { ShipmentRecord } from "@/lib/logistics/shipments";
import {
  WORLD_MONITOR_LAYER_GROUPS,
  WORLD_MONITOR_LAYERS,
  WORLD_MONITOR_PUBLIC_LAYER_IDS,
  type WorldMonitorLayer,
  type WorldMonitorLayerGroup,
} from "@/lib/world-monitor-layers";
import { requestJson } from "@/lib/logistics/client";
import DetailDrawer from "./DetailDrawer";
import ShipmentRoute from "./ShipmentRoute";

const OphanimMap = dynamic(() => import("@/components/OphanimMap"), {
  ssr: false,
  loading: () => (
    <div className="world-map-loading">
      <Activity aria-hidden="true" size={18} />
      Initializing live map engine
    </div>
  ),
});

type MonitorMode = "worldmonitor" | "ophanim";
type FeedState = { label: string; count: number; ok: boolean };
type MapData = Record<string, unknown>;

const REGION_PRESETS = [
  { key: "global", label: "Global", lat: 20, lng: 0, zoom: 1.35 },
  { key: "mena", label: "MENA", lat: 25, lng: 43, zoom: 3.1 },
  { key: "europe", label: "Europe", lat: 52, lng: 14, zoom: 3.1 },
  { key: "asia", label: "Asia", lat: 30, lng: 100, zoom: 2.35 },
  { key: "americas", label: "Americas", lat: 15, lng: -79, zoom: 2.1 },
  { key: "africa", label: "Africa", lat: 2, lng: 21, zoom: 2.7 },
  { key: "oceania", label: "Oceania", lat: -24, lng: 141, zoom: 2.65 },
] as const;

const DEFAULT_OPHANIM_LAYERS: Record<string, boolean> = {
  flights: true,
  private: true,
  jets: true,
  military: true,
  maritime: true,
  ship_cargo: true,
  ship_tanker: true,
  ship_passenger: true,
  ship_fishing: true,
  ship_military: true,
  satellites: true,
  cctv: true,
  camera_transport: true,
  live_news: true,
  news_intel: true,
  earthquakes: true,
  fires: true,
  weather: true,
  infrastructure: true,
  global_incidents: true,
  conflict_zones: true,
  internet_outages: true,
  malware: true,
  war_sanctions: true,
  day_night: true,
  sdk_sea: true,
  gps_jamming: true,
  radiation: false,
  terrain_3d: false,
};

const EMPTY_DATA: MapData = {
  commercial_flights: [],
  private_flights: [],
  private_jets: [],
  military_flights: [],
  gps_jamming: [],
  maritime_ports: [],
  maritime_chokepoints: [],
  maritime_ships: [],
  satellites: [],
  cameras: [],
  live_feeds: [],
  news: [],
  earthquakes: [],
  fires: [],
  weather_events: [],
  infrastructure: [],
  gdelt: [],
  malware_threats: [],
};

async function readJson(path: string): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as Record<string, unknown>;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

const LOCAL_FEEDS = [
  {
    key: "earthquakes",
    label: "Earthquakes",
    path: "/api/earthquakes",
    map: (payload: MapData) => ({ earthquakes: list(payload.earthquakes) }),
    count: (payload: MapData) => list(payload.earthquakes).length,
  },
  {
    key: "news",
    label: "Verified news",
    path: "/api/news",
    map: (payload: MapData) => ({ news: list(payload.news) }),
    count: (payload: MapData) => list(payload.news).length,
  },
  {
    key: "flights",
    label: "Aircraft",
    path: "/api/flights",
    map: (payload: MapData) => ({
      commercial_flights: list(payload.commercial_flights),
      private_flights: list(payload.private_flights),
      private_jets: list(payload.private_jets),
      military_flights: list(payload.military_flights),
      gps_jamming: list(payload.gps_jamming),
      flight_source: payload.source,
      flight_timestamp: payload.timestamp,
    }),
    count: (payload: MapData) =>
      list(payload.commercial_flights).length +
      list(payload.private_flights).length +
      list(payload.private_jets).length +
      list(payload.military_flights).length,
  },
  {
    key: "satellites",
    label: "Satellites",
    path: "/api/satellites",
    map: (payload: MapData) => ({ satellites: list(payload.satellites) }),
    count: (payload: MapData) => list(payload.satellites).length,
  },
  {
    key: "fires",
    label: "Fires",
    path: "/api/fires",
    map: (payload: MapData) => ({ fires: list(payload.fires) }),
    count: (payload: MapData) => list(payload.fires).length,
  },
  {
    key: "cctv",
    label: "Public cameras",
    path: "/api/cctv?region=all",
    map: (payload: MapData) => ({ cameras: list(payload.cameras) }),
    count: (payload: MapData) => list(payload.cameras).length,
  },
  {
    key: "maritime",
    label: "Maritime",
    path: "/api/maritime",
    map: (payload: MapData) => ({
      maritime_ports: list(payload.ports),
      maritime_chokepoints: list(payload.chokepoints),
      maritime_ships: list(payload.ships),
      maritime_sources: list(payload.sources),
      maritime_timestamp: payload.timestamp,
    }),
    count: (payload: MapData) =>
      list(payload.ports).length +
      list(payload.chokepoints).length +
      list(payload.ships).length,
  },
  {
    key: "live-news",
    label: "Live broadcasts",
    path: "/api/live-news",
    map: (payload: MapData) => ({ live_feeds: list(payload.feeds) }),
    count: (payload: MapData) => list(payload.feeds).length,
  },
  {
    key: "weather",
    label: "Severe weather",
    path: "/api/weather",
    map: (payload: MapData) => ({ weather_events: list(payload.events) }),
    count: (payload: MapData) => list(payload.events).length,
  },
  {
    key: "infrastructure",
    label: "Infrastructure",
    path: "/api/infrastructure",
    map: (payload: MapData) => ({ infrastructure: list(payload.infrastructure) }),
    count: (payload: MapData) => list(payload.infrastructure).length,
  },
  {
    key: "gdelt",
    label: "Global incidents",
    path: "/api/gdelt",
    map: (payload: MapData) => ({ gdelt: list(payload.events) }),
    count: (payload: MapData) => list(payload.events).length,
  },
  {
    key: "malware",
    label: "Cyber threats",
    path: "/api/malware",
    map: (payload: MapData) => ({ malware_threats: list(payload.threats) }),
    count: (payload: MapData) => list(payload.threats).length,
  },
] as const;

export default function LogisticsMapWorkspace() {
  const query = useSearchParams();
  const [mode, setMode] = useState<MonitorMode>("worldmonitor");
  const [regionKey, setRegionKey] = useState("global");
  const [group, setGroup] = useState<WorldMonitorLayerGroup | "All">("All");
  const [search, setSearch] = useState("");
  const [publicLayers, setPublicLayers] = useState<string[]>(
    WORLD_MONITOR_PUBLIC_LAYER_IDS,
  );
  const [activeLayers, setActiveLayers] = useState(DEFAULT_OPHANIM_LAYERS);
  const [data, setData] = useState<MapData>(EMPTY_DATA);
  const [providerLayers, setProviderLayers] = useState<ProviderMapLayer[]>([]);
  const [feedStates, setFeedStates] = useState<FeedState[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<WorldMonitorLayer | null>(
    null,
  );
  const [selectedEntity, setSelectedEntity] = useState<MapData | null>(null);
  const [shipment, setShipment] = useState<ShipmentRecord | null>(null);
  const [disruption, setDisruption] = useState<DisruptionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const region =
    REGION_PRESETS.find((item) => item.key === regionKey) ?? REGION_PRESETS[0];

  const loadOphanimFeeds = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled(
      LOCAL_FEEDS.map(async (feed) => {
        const payload = await readJson(feed.path);
        return { feed, payload };
      }),
    );

    const nextData: MapData = { ...EMPTY_DATA };
    const nextStates: FeedState[] = [];
    results.forEach((result, index) => {
      const feed = LOCAL_FEEDS[index];
      if (result.status === "fulfilled") {
        Object.assign(nextData, feed.map(result.value.payload));
        nextStates.push({
          label: feed.label,
          count: feed.count(result.value.payload),
          ok: true,
        });
      } else {
        nextStates.push({ label: feed.label, count: 0, ok: false });
      }
    });

    try {
      const payload = await readJson(
        "/api/map/layers?providers=maritime-map,submarine-cables,infrastructure-map,war-sanctions",
      );
      setProviderLayers(list(payload.layers) as ProviderMapLayer[]);
    } catch {
      setProviderLayers([]);
    }

    setData(nextData);
    setFeedStates(nextStates);
    setLastUpdated(new Date());
    setRefreshToken((current) => current + 1);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadOphanimFeeds);
  }, [loadOphanimFeeds]);

  useEffect(() => {
    const shipmentId = query.get("shipment");
    const disruptionId = query.get("disruption");
    if (shipmentId) {
      void requestJson<{ shipment: ShipmentRecord }>(
        `/api/logistics/shipments/${shipmentId}`,
      )
        .then((response) => setShipment(response.shipment))
        .catch(() => setShipment(null));
    }
    if (disruptionId) {
      void requestJson<{ disruption: DisruptionRecord }>(
        `/api/logistics/disruptions/${disruptionId}`,
      )
        .then((response) => setDisruption(response.disruption))
        .catch(() => setDisruption(null));
    }
  }, [query]);

  const visibleCatalog = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return WORLD_MONITOR_LAYERS.filter(
      (item) =>
        (group === "All" || item.group === group) &&
        (!normalized ||
          item.label.toLowerCase().includes(normalized) ||
          item.source.toLowerCase().includes(normalized)),
    );
  }, [group, search]);

  const embedUrl = useMemo(() => {
    const params = new URLSearchParams({
      layers: publicLayers.join(","),
      center: `${region.lat},${region.lng}`,
      zoom: String(region.zoom),
      theme: "dark",
      variant: "full",
    });
    return `https://www.worldmonitor.app/embed?${params.toString()}`;
  }, [publicLayers, region]);

  const availableCount = WORLD_MONITOR_LAYERS.filter((item) =>
    mode === "worldmonitor" ? item.embedId : item.ophanimKey,
  ).length;
  const activeCount =
    mode === "worldmonitor"
      ? publicLayers.length
      : new Set(
          WORLD_MONITOR_LAYERS.filter(
            (item) => item.ophanimKey && activeLayers[item.ophanimKey],
          ).map((item) => item.ophanimKey),
        ).size;
  const liveFeedCount = feedStates.filter((item) => item.ok).length;
  const pointCount = feedStates.reduce((total, item) => total + item.count, 0);

  const toggleCatalogLayer = (item: WorldMonitorLayer) => {
    setSelectedLayer(item);
    if (mode === "worldmonitor" && item.embedId) {
      setPublicLayers((current) =>
        current.includes(item.embedId!)
          ? current.filter((id) => id !== item.embedId)
          : [...current, item.embedId!],
      );
    }
    if (mode === "ophanim" && item.ophanimKey) {
      setActiveLayers((current) => ({
        ...current,
        [item.ophanimKey!]: !current[item.ophanimKey!],
      }));
    }
  };

  const isLayerActive = (item: WorldMonitorLayer) =>
    mode === "worldmonitor"
      ? Boolean(item.embedId && publicLayers.includes(item.embedId))
      : Boolean(item.ophanimKey && activeLayers[item.ophanimKey]);
  const isLayerAvailable = (item: WorldMonitorLayer) =>
    mode === "worldmonitor" ? Boolean(item.embedId) : Boolean(item.ophanimKey);

  const selectedEntityTitle = selectedEntity
    ? String(
        selectedEntity.label ??
          selectedEntity.name ??
          selectedEntity.title ??
          selectedEntity.id ??
          "Map selection",
      )
    : null;
  const detailTitle =
    shipment?.shipmentReference ??
    disruption?.title ??
    selectedEntityTitle ??
    selectedLayer?.label ??
    "Map detail";

  return (
    <main className="world-map-workspace">
      <header className="world-map-toolbar">
        <div className="world-map-title">
          <span aria-hidden="true">
            <Globe2 size={18} />
          </span>
          <div>
            <p>Operational map</p>
            <h1>Global situation monitor</h1>
          </div>
        </div>

        <div className="world-map-mode" aria-label="Map data source">
          <button
            type="button"
            className={mode === "worldmonitor" ? "is-active" : ""}
            onClick={() => setMode("worldmonitor")}
          >
            WorldMonitor public
          </button>
          <button
            type="button"
            className={mode === "ophanim" ? "is-active" : ""}
            onClick={() => setMode("ophanim")}
          >
            Ophanim live
          </button>
        </div>

        <div className="world-map-metrics" aria-label="Map status">
          <span>
            <strong>{activeCount}</strong> active
          </span>
          <span>
            <strong>{availableCount}</strong> available
          </span>
          <span>
            <strong>{WORLD_MONITOR_LAYERS.length}</strong> catalogued
          </span>
        </div>

        <div className="world-map-actions">
          <label>
            <span className="sr-only">Map region</span>
            <MapPinned aria-hidden="true" size={14} />
            <select
              value={regionKey}
              onChange={(event) => setRegionKey(event.target.value)}
            >
              {REGION_PRESETS.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="world-map-icon-button"
            title="Refresh map feeds"
            aria-label="Refresh map feeds"
            disabled={loading}
            onClick={() => void loadOphanimFeeds()}
          >
            <RefreshCw
              aria-hidden="true"
              size={15}
              className={loading ? "ops-spin" : ""}
            />
          </button>
        </div>
      </header>

      <section className="world-map-stage">
        <aside className="world-map-layer-rail">
          <div className="world-map-layer-rail__head">
            <div>
              <Layers3 aria-hidden="true" size={15} />
              <strong>Visible layers</strong>
            </div>
            <span>{visibleCatalog.length}</span>
          </div>

          <label className="world-map-search">
            <Search aria-hidden="true" size={14} />
            <span className="sr-only">Search map layers</span>
            <input
              type="search"
              value={search}
              placeholder="Search layers"
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                type="button"
                aria-label="Clear layer search"
                onClick={() => setSearch("")}
              >
                <X aria-hidden="true" size={13} />
              </button>
            )}
          </label>

          <div className="world-map-groups" aria-label="Layer groups">
            <button
              type="button"
              className={group === "All" ? "is-active" : ""}
              onClick={() => setGroup("All")}
            >
              All
            </button>
            {WORLD_MONITOR_LAYER_GROUPS.map((item) => (
              <button
                type="button"
                key={item}
                className={group === item ? "is-active" : ""}
                onClick={() => setGroup(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="world-map-layer-list">
            {visibleCatalog.map((item) => {
              const active = isLayerActive(item);
              const available = isLayerAvailable(item);
              return (
                <button
                  type="button"
                  key={item.key}
                  className={`world-map-layer ${active ? "is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => toggleCatalogLayer(item)}
                >
                  <span className="world-map-layer__state" aria-hidden="true">
                    {active ? (
                      <Check size={12} />
                    ) : available ? (
                      <span />
                    ) : (
                      <LockKeyhole size={11} />
                    )}
                  </span>
                  <span className="world-map-layer__copy">
                    <strong>{item.label}</strong>
                    <small>{available ? item.source : "API connector required"}</small>
                  </span>
                  <ChevronRight aria-hidden="true" size={13} />
                </button>
              );
            })}
          </div>
        </aside>

        <div className="world-map-canvas">
          {mode === "worldmonitor" ? (
            <iframe
              key={embedUrl}
              className="world-map-embed"
              src={embedUrl}
              title="WorldMonitor public global map"
              loading="eager"
              referrerPolicy="strict-origin-when-cross-origin"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
          ) : (
            <OphanimMap
              key={`${refreshToken}-${regionKey}`}
              data={data}
              activeLayers={activeLayers}
              providerLayers={providerLayers}
              initialView={{
                latitude: region.lat,
                longitude: region.lng,
                zoom: region.zoom,
              }}
              onEntityClick={(entity) => setSelectedEntity(entity as MapData)}
              projection="globe"
              mapStyle="dark"
              theme="core"
            />
          )}

          <div className="world-map-source-badge">
            <span />
            {mode === "worldmonitor"
              ? "Official public embed"
              : loading
                ? "Updating open feeds"
                : `${liveFeedCount}/${LOCAL_FEEDS.length} feeds responding`}
          </div>

          {selectedLayer && !shipment && !disruption && !selectedEntity && (
            <aside className="world-map-inspector">
              <button
                type="button"
                aria-label="Close layer detail"
                onClick={() => setSelectedLayer(null)}
              >
                <X aria-hidden="true" size={14} />
              </button>
              <p>{selectedLayer.group}</p>
              <h2>{selectedLayer.label}</h2>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>
                    {isLayerAvailable(selectedLayer)
                      ? isLayerActive(selectedLayer)
                        ? "Visible"
                        : "Available"
                      : "Connector required"}
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{selectedLayer.source}</dd>
                </div>
              </dl>
              {!isLayerAvailable(selectedLayer) && (
                <p className="world-map-inspector__note">
                  This layer is catalogued but is not represented as live data
                  without the appropriate WorldMonitor API access or a verified
                  Ophanim provider.
                </p>
              )}
            </aside>
          )}
        </div>
      </section>

      <footer className="world-map-statusbar">
        <div>
          <ShieldCheck aria-hidden="true" size={13} />
          <span>
            Indicators are monitoring leads. Verify source evidence before an
            operational decision.
          </span>
        </div>
        <div>
          {mode === "ophanim" && (
            <span>
              {pointCount.toLocaleString()} objects
              {lastUpdated
                ? ` · updated ${lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </span>
          )}
          {mode === "worldmonitor" && (
            <a
              href="https://www.worldmonitor.app/"
              target="_blank"
              rel="noreferrer"
            >
              Open WorldMonitor <ExternalLink aria-hidden="true" size={11} />
            </a>
          )}
          <Link href="/events">Open event ledger</Link>
        </div>
      </footer>

      {(selectedEntity || shipment || disruption) && (
        <DetailDrawer
          title={detailTitle}
          onClose={() => {
            setSelectedEntity(null);
            setShipment(null);
            setDisruption(null);
          }}
        >
          {shipment ? (
            <div className="ops-map-detail">
              <ShipmentRoute
                origin={shipment.originPortName}
                destination={shipment.destinationPortName}
                transshipments={shipment.transshipmentPorts}
              />
              <p>
                Shipment coordinates are not inferred. Only recorded route and
                assessment data appear here.
              </p>
            </div>
          ) : disruption ? (
            <div className="ops-map-detail">
              <p>
                {disruption.description ||
                  "No disruption description has been recorded."}
              </p>
              <p>
                Coordinates: {disruption.latitude ?? "Unavailable"},{" "}
                {disruption.longitude ?? "Unavailable"}
              </p>
            </div>
          ) : (
            <div className="ops-map-detail">
              {Object.entries(selectedEntity ?? {})
                .slice(0, 10)
                .map(([key, value]) => (
                  <p key={key}>
                    <strong>{key.replaceAll("_", " ")}:</strong>{" "}
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </p>
                ))}
            </div>
          )}
        </DetailDrawer>
      )}
    </main>
  );
}
