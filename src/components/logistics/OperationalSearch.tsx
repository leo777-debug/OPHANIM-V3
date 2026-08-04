"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Search, X } from "lucide-react";
import type { ShipmentRecord } from "@/lib/logistics/shipments";
import type { DisruptionRecord } from "@/lib/logistics/disruptions";
import { requestJson } from "@/lib/logistics/client";

type Result = {
  id: string;
  label: string;
  detail: string;
  href: string;
  kind: "shipment" | "disruption";
};

export default function OperationalSearch() {
  const [query, setQuery] = useState("");
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [disruptions, setDisruptions] = useState<DisruptionRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const [shipmentData, disruptionData] = await Promise.all([
        requestJson<{ shipments: ShipmentRecord[] }>(
          "/api/logistics/shipments",
        ),
        requestJson<{ disruptions: DisruptionRecord[] }>(
          "/api/logistics/disruptions",
        ),
      ]);
      setShipments(shipmentData.shipments);
      setDisruptions(disruptionData.disruptions);
      setLoaded(true);
    } catch {
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const results = useMemo<Result[]>(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized.length < 2) return [];
    const shipmentResults = shipments.flatMap((shipment) => {
      const values = [
        shipment.shipmentReference,
        shipment.containerNumber,
        shipment.vesselName,
        shipment.originPortName,
        shipment.destinationPortName,
        shipment.imoNumber,
        shipment.mmsiNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return values.includes(normalized)
        ? [
            {
              id: shipment.id,
              label: shipment.shipmentReference,
              detail: [
                shipment.containerNumber,
                shipment.vesselName,
                shipment.originPortName && shipment.destinationPortName
                  ? `${shipment.originPortName} to ${shipment.destinationPortName}`
                  : undefined,
              ]
                .filter(Boolean)
                .join(" · "),
              href: `/logistics/shipments/${shipment.id}`,
              kind: "shipment" as const,
            },
          ]
        : [];
    });
    const disruptionResults = disruptions.flatMap((disruption) => {
      const values = [
        disruption.title,
        disruption.source,
        disruption.disruptionType,
        ...(disruption.affectedPorts ?? []),
        ...(disruption.affectedVessels ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return values.includes(normalized)
        ? [
            {
              id: disruption.id,
              label: disruption.title,
              detail: `${disruption.disruptionType.replaceAll("_", " ")} · ${disruption.source}`,
              href: `/logistics/disruptions?selected=${disruption.id}`,
              kind: "disruption" as const,
            },
          ]
        : [];
    });
    return [...shipmentResults, ...disruptionResults].slice(0, 8);
  }, [disruptions, query, shipments]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("ops-global-search")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="ops-search">
      <Search aria-hidden="true" size={17} />
      <input
        id="ops-global-search"
        value={query}
        onFocus={() => void load()}
        onChange={(event) => {
          setQuery(event.target.value);
          void load();
        }}
        placeholder="Search shipment, container, vessel, port, or incident"
        aria-label="Search shipments and operational incidents"
      />
      <span className="ops-search__shortcut">Ctrl K</span>
      {loading && (
        <LoaderCircle aria-hidden="true" size={15} className="animate-spin" />
      )}
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear search"
        >
          <X aria-hidden="true" size={15} />
        </button>
      )}
      {query.trim().length >= 2 && (
        <div className="ops-search__results">
          {results.length ? (
            results.map((result) => (
              <Link key={`${result.kind}-${result.id}`} href={result.href}>
                <span>{result.label}</span>
                <small>
                  {result.kind} · {result.detail || "Details unavailable"}
                </small>
              </Link>
            ))
          ) : (
            <p>No matching organization records.</p>
          )}
        </div>
      )}
    </div>
  );
}
