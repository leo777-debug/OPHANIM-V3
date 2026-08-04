"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Layers3, RefreshCw, Ship, TriangleAlert } from "lucide-react";
import type { ProviderMapLayer } from "@/lib/providers";
import type { ShipmentRecord } from "@/lib/logistics/shipments";
import type { DisruptionRecord } from "@/lib/logistics/disruptions";
import { requestJson } from "@/lib/logistics/client";
import DetailDrawer from "./DetailDrawer";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import ShipmentRoute from "./ShipmentRoute";

const OphanimMap = dynamic(() => import("@/components/OphanimMap"), {
  ssr: false,
  loading: () => <div className="ops-map-loading">Loading map engine...</div>,
});

type MaritimeResponse = {
  ports?: unknown[];
  chokepoints?: unknown[];
  ships?: unknown[];
};

export default function LogisticsMapWorkspace() {
  const query = useSearchParams();
  const [data, setData] = useState<Record<string, unknown>>({
    maritime_ports: [],
    maritime_chokepoints: [],
    maritime_ships: [],
  });
  const [providerLayers, setProviderLayers] = useState<ProviderMapLayer[]>([]);
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({
    maritime: true,
    flights: false,
    war_sanctions: false,
  });
  const [selected, setSelected] = useState<Record<string, unknown> | null>(
    null,
  );
  const [shipment, setShipment] = useState<ShipmentRecord | null>(null);
  const [disruption, setDisruption] = useState<DisruptionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [maritime, disruptions] = await Promise.all([
        requestJson<MaritimeResponse>("/api/maritime"),
        requestJson<{ disruptions: DisruptionRecord[] }>(
          "/api/logistics/disruptions",
        ),
      ]);
      setData({
        maritime_ports: maritime.ports ?? [],
        maritime_chokepoints: maritime.chokepoints ?? [],
        maritime_ships: maritime.ships ?? [],
      });
      const layers = await Promise.all(
        disruptions.disruptions.map(async (item) => {
          if (item.latitude === undefined || item.longitude === undefined)
            return [] as ProviderMapLayer[];
          try {
            return (
              await requestJson<{ layers: ProviderMapLayer[] }>(
                `/api/logistics/disruptions/${item.id}/map`,
              )
            ).layers;
          } catch {
            return [] as ProviderMapLayer[];
          }
        }),
      );
      setProviderLayers(layers.flat());
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load logistics map data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  useEffect(() => {
    const shipmentId = query.get("shipment");
    const disruptionId = query.get("disruption");
    if (shipmentId)
      requestJson<{ shipment: ShipmentRecord }>(
        `/api/logistics/shipments/${shipmentId}`,
      )
        .then((response) => setShipment(response.shipment))
        .catch(() => setShipment(null));
    if (disruptionId)
      requestJson<{ disruption: DisruptionRecord }>(
        `/api/logistics/disruptions/${disruptionId}`,
      )
        .then((response) => setDisruption(response.disruption))
        .catch(() => setDisruption(null));
  }, [query]);

  const selectedTitle = useMemo(
    () =>
      String(
        selected?.label ??
          selected?.name ??
          selected?.title ??
          selected?.id ??
          "Map selection",
      ),
    [selected],
  );
  const setLayer = (name: string) =>
    setActiveLayers((current) => ({ ...current, [name]: !current[name] }));

  return (
    <main className="ops-page ops-map-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">Logistics map</p>
            <h1>Map</h1>
            <p className="ops-page-header__detail">
              Live maritime positions, ports, chokepoints, and
              organization-scoped disruption markers. The map does not infer
              shipment coordinates.
            </p>
          </div>
          <div className="ops-page-header__actions">
            <button
              type="button"
              className="ops-button ops-button--secondary"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw
                aria-hidden="true"
                size={15}
                className={loading ? "animate-spin" : ""}
              />
              Refresh layers
            </button>
          </div>
        </header>
        {error && (
          <section className="ops-section">
            <ErrorState message={error} onRetry={() => void load()} />
          </section>
        )}
        <section className="ops-section">
          <div className="ops-map-layout">
            <aside className="ops-map-controls">
              <h2>
                <Layers3 aria-hidden="true" size={16} />
                Visible layers
              </h2>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(activeLayers.maritime)}
                  onChange={() => setLayer("maritime")}
                />{" "}
                <Ship aria-hidden="true" size={14} />
                Maritime positions, ports, chokepoints
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(activeLayers.war_sanctions)}
                  onChange={() => setLayer("war_sanctions")}
                />{" "}
                <TriangleAlert aria-hidden="true" size={14} />
                Legacy sanctions layer
              </label>
              <p>
                Shipment-risk, rescue-status, customer, and route filters
                require shipment coordinate and assessment-list APIs. They are
                not approximated in the browser.
              </p>
            </aside>
            <section className="ops-map-canvas">
              {loading ? (
                <EmptyState
                  title="Loading logistics map"
                  detail="Preparing live maritime and organization-scoped disruption layers."
                />
              ) : (
                <OphanimMap
                  data={data}
                  activeLayers={activeLayers}
                  providerLayers={providerLayers}
                  onEntityClick={(entity) => setSelected(entity)}
                  projection="mercator"
                  mapStyle="dark"
                  theme="core"
                />
              )}
            </section>
            {(selected || shipment || disruption) && (
              <DetailDrawer
                title={
                  shipment
                    ? shipment.shipmentReference
                    : disruption
                      ? disruption.title
                      : selectedTitle
                }
                onClose={() => {
                  setSelected(null);
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
                      Shipment coordinates are not recorded, so the map cannot
                      place this shipment directly.
                    </p>
                  </div>
                ) : disruption ? (
                  <div className="ops-map-detail">
                    <p>
                      {disruption.description ||
                        "No disruption description recorded."}
                    </p>
                    <p>
                      Coordinates:{" "}
                      {disruption.latitude !== undefined &&
                      disruption.longitude !== undefined
                        ? `${disruption.latitude.toFixed(4)}, ${disruption.longitude.toFixed(4)}`
                        : "Unavailable"}
                    </p>
                  </div>
                ) : (
                  <div className="ops-map-detail">
                    <p>{String(selected?.type ?? "Map object")}</p>
                    <p>
                      {String(
                        selected?.name ??
                          selected?.label ??
                          "No additional map detail was provided.",
                      )}
                    </p>
                  </div>
                )}
              </DetailDrawer>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
