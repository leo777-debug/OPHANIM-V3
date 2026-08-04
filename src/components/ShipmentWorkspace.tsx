"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  FileUp,
  MoreHorizontal,
  Plus,
  Save,
  ShipWheel,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ShipmentInput } from "@/lib/logistics/types";
import type { ShipmentRecord } from "@/lib/logistics/shipments";
import { hrefForMap, isoDate, requestJson } from "@/lib/logistics/client";
import EmptyState from "./logistics/EmptyState";
import ErrorState from "./logistics/ErrorState";
import FilterBar from "./logistics/FilterBar";
import OperationalTimeline, {
  type TimelineEvent,
} from "./logistics/OperationalTimeline";
import ShipmentRoute from "./logistics/ShipmentRoute";

const emptyShipment: ShipmentInput = {
  shipmentReference: "",
  operationalTimezone: "UTC",
  priority: 3,
  currentStatus: "planned",
};
type Filters = {
  query: string;
  status: string;
  carrier: string;
  vessel: string;
  origin: string;
  destination: string;
  sort: "arrival" | "departure" | "reference";
};
const defaultFilters: Filters = {
  query: "",
  status: "",
  carrier: "",
  vessel: "",
  origin: "",
  destination: "",
  sort: "arrival",
};

function formFrom(shipment: ShipmentRecord): ShipmentInput {
  return {
    shipmentReference: shipment.shipmentReference,
    bookingNumber: shipment.bookingNumber,
    containerNumber: shipment.containerNumber,
    billOfLadingReference: shipment.billOfLadingReference,
    carrier: shipment.carrier,
    vesselName: shipment.vesselName,
    imoNumber: shipment.imoNumber,
    mmsiNumber: shipment.mmsiNumber,
    originPortName: shipment.originPortName,
    originPortCode: shipment.originPortCode,
    destinationPortName: shipment.destinationPortName,
    destinationPortCode: shipment.destinationPortCode,
    transshipmentPorts: shipment.transshipmentPorts,
    customerId: shipment.customerId,
    customerContact: shipment.customerContact,
    ownerUserId: shipment.ownerUserId,
    operationalTimezone: shipment.operationalTimezone,
    plannedDepartureAt: shipment.plannedDepartureAt,
    plannedArrivalAt: shipment.plannedArrivalAt,
    actualDepartureAt: shipment.actualDepartureAt,
    actualArrivalAt: shipment.actualArrivalAt,
    cargoType: shipment.cargoType,
    priority: shipment.priority,
    currentStatus: shipment.currentStatus,
  };
}

function timeline(shipment: ShipmentRecord): TimelineEvent[] {
  const events: Array<TimelineEvent | undefined> = [
    shipment.actualDepartureAt
      ? {
          id: "actual-departure",
          label: "Actual departure",
          at: shipment.actualDepartureAt,
          state: "completed" as const,
        }
      : shipment.plannedDepartureAt
        ? {
            id: "planned-departure",
            label: "Planned departure",
            at: shipment.plannedDepartureAt,
            state: "upcoming" as const,
          }
        : undefined,
    shipment.actualArrivalAt
      ? {
          id: "actual-arrival",
          label: "Actual arrival",
          at: shipment.actualArrivalAt,
          state: "completed" as const,
        }
      : shipment.plannedArrivalAt
        ? {
            id: "planned-arrival",
            label: "Planned arrival",
            at: shipment.plannedArrivalAt,
            state: "upcoming" as const,
          }
        : undefined,
  ];

  return events
    .filter((event): event is TimelineEvent => event !== undefined)
    .sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
}

export default function ShipmentWorkspace({
  shipmentId,
}: {
  shipmentId?: string;
}) {
  const router = useRouter();
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [shipment, setShipment] = useState<ShipmentRecord | null>(null);
  const [form, setForm] = useState<ShipmentInput>(emptyShipment);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [showCreate, setShowCreate] = useState(false);
  const [openMenu, setOpenMenu] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (shipmentId) {
        const data = await requestJson<{ shipment: ShipmentRecord }>(
          `/api/logistics/shipments/${shipmentId}`,
        );
        setShipment(data.shipment);
        setForm(formFrom(data.shipment));
      } else {
        const data = await requestJson<{ shipments: ShipmentRecord[] }>(
          "/api/logistics/shipments",
        );
        setShipments(data.shipments);
      }
    } catch (cause) {
      if (
        cause instanceof Error &&
        cause.message === "Authentication is required."
      )
        router.replace("/login");
      else
        setError(
          cause instanceof Error ? cause.message : "Unable to load shipments.",
        );
    } finally {
      setLoading(false);
    }
  }, [router, shipmentId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const filtered = useMemo(() => {
    const needle = filters.query.trim().toLowerCase();
    return shipments
      .filter((item) => {
        const searchable = [
          item.shipmentReference,
          item.containerNumber,
          item.carrier,
          item.vesselName,
          item.originPortName,
          item.destinationPortName,
          item.imoNumber,
          item.mmsiNumber,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (
          (!needle || searchable.includes(needle)) &&
          (!filters.status || item.currentStatus === filters.status) &&
          (!filters.carrier || item.carrier === filters.carrier) &&
          (!filters.vessel || item.vesselName === filters.vessel) &&
          (!filters.origin || item.originPortName === filters.origin) &&
          (!filters.destination ||
            item.destinationPortName === filters.destination)
        );
      })
      .sort((a, b) => {
        if (filters.sort === "reference")
          return a.shipmentReference.localeCompare(b.shipmentReference);
        const field =
          filters.sort === "departure"
            ? "plannedDepartureAt"
            : "plannedArrivalAt";
        return (a[field] ?? "9999").localeCompare(b[field] ?? "9999");
      });
  }, [filters, shipments]);

  const options = (field: keyof ShipmentRecord) =>
    Array.from(
      new Set(
        shipments
          .map((item) => item[field])
          .filter(
            (value): value is string =>
              typeof value === "string" && Boolean(value),
          ),
      ),
    ).sort();
  const update = <K extends keyof ShipmentInput>(
    field: K,
    value: ShipmentInput[K],
  ) => setForm((current) => ({ ...current, [field]: value }));

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (shipmentId) {
        const data = await requestJson<{ shipment: ShipmentRecord }>(
          `/api/logistics/shipments/${shipmentId}`,
          { method: "PATCH", body: JSON.stringify(form) },
        );
        setShipment(data.shipment);
        setForm(formFrom(data.shipment));
      } else {
        const data = await requestJson<{ shipment: ShipmentRecord }>(
          "/api/logistics/shipments",
          { method: "POST", body: JSON.stringify(form) },
        );
        router.push(`/logistics/shipments/${data.shipment.id}`);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to save shipment.",
      );
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/logistics/shipments/${id}`, { method: "DELETE" });
      setOpenMenu(undefined);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to archive shipment.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveView = () =>
    window.localStorage.setItem(
      "ophanim-logistics-shipment-view",
      JSON.stringify(filters),
    );
  const loadView = () => {
    try {
      const saved = window.localStorage.getItem(
        "ophanim-logistics-shipment-view",
      );
      if (saved) setFilters({ ...defaultFilters, ...JSON.parse(saved) });
    } catch {
      /* Ignore unavailable browser storage. */
    }
  };

  if (shipmentId)
    return (
      <ShipmentDetail
        shipment={shipment}
        form={form}
        loading={loading}
        saving={saving}
        error={error}
        onChange={update}
        onSave={() => void save()}
        onRetry={() => void load()}
      />
    );

  return (
    <main className="ops-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">Shipment management</p>
            <h1>Shipments</h1>
            <p className="ops-page-header__detail">
              Organization-scoped transport records. Exposure and rescue filters
              require a scoped assessment endpoint and are not inferred here.
            </p>
          </div>
          <div className="ops-page-header__actions">
            <Link href="/imports" className="ops-button ops-button--secondary">
              <FileUp aria-hidden="true" size={15} />
              Import CSV
            </Link>
            <button
              type="button"
              className="ops-button ops-button--primary"
              onClick={() => {
                setForm(emptyShipment);
                setShowCreate(true);
              }}
            >
              <Plus aria-hidden="true" size={15} />
              New shipment
            </button>
          </div>
        </header>
        {error && (
          <section className="ops-section">
            <ErrorState message={error} onRetry={() => void load()} />
          </section>
        )}
        <section className="ops-section">
          <FilterBar onReset={() => setFilters(defaultFilters)}>
            <input
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  query: event.target.value,
                }))
              }
              placeholder="Search reference, container, vessel, port"
              aria-label="Search shipments"
            />
            <Select
              value={filters.status}
              onChange={(status) =>
                setFilters((current) => ({ ...current, status }))
              }
              label="All statuses"
              options={options("currentStatus")}
            />
            <Select
              value={filters.carrier}
              onChange={(carrier) =>
                setFilters((current) => ({ ...current, carrier }))
              }
              label="All carriers"
              options={options("carrier")}
            />
            <Select
              value={filters.vessel}
              onChange={(vessel) =>
                setFilters((current) => ({ ...current, vessel }))
              }
              label="All vessels"
              options={options("vesselName")}
            />
            <Select
              value={filters.origin}
              onChange={(origin) =>
                setFilters((current) => ({ ...current, origin }))
              }
              label="All origins"
              options={options("originPortName")}
            />
            <Select
              value={filters.destination}
              onChange={(destination) =>
                setFilters((current) => ({ ...current, destination }))
              }
              label="All destinations"
              options={options("destinationPortName")}
            />
            <select
              aria-label="Sort shipments"
              value={filters.sort}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  sort: event.target.value as Filters["sort"],
                }))
              }
            >
              <option value="arrival">Sort by ETA</option>
              <option value="departure">Sort by ETD</option>
              <option value="reference">Sort by reference</option>
            </select>
            <button
              type="button"
              className="ops-filter-reset"
              onClick={saveView}
            >
              Save view
            </button>
            <button
              type="button"
              className="ops-filter-reset"
              onClick={loadView}
            >
              Load view
            </button>
          </FilterBar>
        </section>
        <section className="ops-section">
          <div className="ops-section__header">
            <div>
              <h2>Shipment list</h2>
              <p>
                {filtered.length} of {shipments.length} active shipment
                {shipments.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="ops-panel ops-shipment-table">
            {loading ? (
              <EmptyState
                title="Loading shipments"
                detail="Retrieving current organization-scoped shipment records."
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No shipments found"
                detail={
                  shipments.length
                    ? "No active shipment matches the selected filters."
                    : "Upload active shipments to identify which operations may be affected by current disruptions."
                }
                action={
                  !shipments.length ? (
                    <Link
                      className="ops-button ops-button--primary"
                      href="/imports"
                    >
                      Import Shipments
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Shipment</th>
                    <th>Route</th>
                    <th>Vessel</th>
                    <th>ETD</th>
                    <th>ETA</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <Link
                          href={`/logistics/shipments/${item.id}`}
                          className="ops-table-link"
                        >
                          {item.shipmentReference}
                        </Link>
                        <small>
                          {item.containerNumber
                            ? `Container ${item.containerNumber}`
                            : "Container unavailable"}
                        </small>
                      </td>
                      <td>
                        <ShipmentRoute
                          origin={item.originPortName}
                          destination={item.destinationPortName}
                          transshipments={item.transshipmentPorts}
                        />
                      </td>
                      <td>
                        {item.vesselName ?? "Unavailable"}
                        <small>{item.carrier ?? "Carrier unavailable"}</small>
                      </td>
                      <td>{isoDate(item.plannedDepartureAt)}</td>
                      <td>{isoDate(item.plannedArrivalAt)}</td>
                      <td>
                        <span className="ops-status">
                          {(item.currentStatus ?? "unknown").replaceAll(
                            "_",
                            " ",
                          )}
                        </span>
                      </td>
                      <td className="ops-overflow">
                        <button
                          type="button"
                          className="ops-icon-button"
                          onClick={() =>
                            setOpenMenu(
                              openMenu === item.id ? undefined : item.id,
                            )
                          }
                          aria-label={`Open actions for ${item.shipmentReference}`}
                        >
                          <MoreHorizontal aria-hidden="true" size={17} />
                        </button>
                        {openMenu === item.id && (
                          <div className="ops-overflow__menu">
                            <Link href={`/logistics/shipments/${item.id}`}>
                              View shipment
                            </Link>
                            <Link href={hrefForMap(item.id)}>Open on map</Link>
                            <Link href="/logistics/rescue">Start rescue</Link>
                            <button
                              type="button"
                              onClick={() => void archive(item.id)}
                              disabled={saving}
                            >
                              <Archive aria-hidden="true" size={14} />
                              Archive
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        {showCreate && (
          <section className="ops-section" aria-label="Create shipment">
            <div className="ops-panel ops-editor">
              <div className="ops-section__header">
                <div>
                  <h2>New shipment</h2>
                  <p>
                    Only recorded values are saved. Milestone and ownership
                    fields require their respective API records.
                  </p>
                </div>
                <button
                  className="ops-button ops-button--secondary"
                  type="button"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
              </div>
              <ShipmentEditor
                form={form}
                onChange={update}
                onSave={() => void save()}
                saving={saving}
              />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function ShipmentDetail({
  shipment,
  form,
  loading,
  saving,
  error,
  onChange,
  onSave,
  onRetry,
}: {
  shipment: ShipmentRecord | null;
  form: ShipmentInput;
  loading: boolean;
  saving: boolean;
  error: string;
  onChange: <K extends keyof ShipmentInput>(
    field: K,
    value: ShipmentInput[K],
  ) => void;
  onSave: () => void;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <main className="ops-page">
        <div className="ops-page__inner">
          <div className="ops-panel">
            <EmptyState
              title="Loading shipment"
              detail="Retrieving the selected shipment record."
            />
          </div>
        </div>
      </main>
    );
  if (!shipment)
    return (
      <main className="ops-page">
        <div className="ops-page__inner">
          <ErrorState
            message={error || "Shipment was not found."}
            onRetry={onRetry}
          />
        </div>
      </main>
    );
  return (
    <main className="ops-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">Shipment details</p>
            <h1>{shipment.shipmentReference}</h1>
            <p className="ops-page-header__detail">
              {shipment.customerId
                ? `Customer ${shipment.customerId}`
                : "Customer unavailable"}{" "}
              · Owner ID {shipment.ownerUserId ?? "not recorded"}
            </p>
          </div>
          <div className="ops-page-header__actions">
            <Link
              href="/logistics/rescue"
              className="ops-button ops-button--primary"
            >
              <ShipWheel aria-hidden="true" size={15} />
              Start Rescue
            </Link>
            <Link
              href={hrefForMap(shipment.id)}
              className="ops-button ops-button--secondary"
            >
              Open on Map
            </Link>
          </div>
        </header>
        {error && (
          <section className="ops-section">
            <ErrorState message={error} onRetry={onRetry} />
          </section>
        )}
        <div className="ops-detail-grid">
          <section className="ops-panel ops-detail-panel">
            <h2>Shipment summary</h2>
            <dl className="ops-definition-list">
              <Definition label="Container" value={shipment.containerNumber} />
              <Definition label="Booking" value={shipment.bookingNumber} />
              <Definition
                label="Bill of lading"
                value={shipment.billOfLadingReference}
              />
              <Definition label="Carrier" value={shipment.carrier} />
              <Definition label="Vessel" value={shipment.vesselName} />
              <Definition label="IMO" value={shipment.imoNumber} />
              <Definition label="Origin" value={shipment.originPortName} />
              <Definition
                label="Destination"
                value={shipment.destinationPortName}
              />
              <Definition
                label="Transshipment ports"
                value={shipment.transshipmentPorts?.join(", ")}
              />
              <Definition
                label="ETD"
                value={isoDate(shipment.plannedDepartureAt)}
              />
              <Definition
                label="ETA"
                value={isoDate(shipment.plannedArrivalAt)}
              />
            </dl>
          </section>
          <section className="ops-panel ops-detail-panel">
            <h2>Operational timeline</h2>
            <OperationalTimeline events={timeline(shipment)} />
          </section>
          <section className="ops-panel ops-detail-panel">
            <h2>Exposure</h2>
            <EmptyState
              title="Exposure data not loaded"
              detail="The existing API exposes impact assessments by disruption, not by shipment. This page will not infer exposure, confidence, or a disruption match."
              action={
                <Link
                  className="ops-button ops-button--secondary"
                  href="/logistics/disruptions"
                >
                  Review disruptions
                </Link>
              }
            />
          </section>
          <section className="ops-panel ops-detail-panel">
            <h2>Last safe move</h2>
            <p className="ops-muted">
              No backend last-safe-move record is available for this shipment
              route.
            </p>
          </section>
          <section className="ops-panel ops-detail-panel ops-detail-panel--wide">
            <h2>Activity</h2>
            <EmptyState
              title="Activity feed unavailable"
              detail="Comments, ownership changes, notifications, and uploaded documents are not currently exposed through a shipment activity API."
            />
          </section>
        </div>
        <section className="ops-section">
          <div className="ops-panel ops-editor">
            <div className="ops-section__header">
              <div>
                <h2>Edit shipment</h2>
                <p>
                  Updates use the existing organization-scoped shipment
                  endpoint.
                </p>
              </div>
            </div>
            <ShipmentEditor
              form={form}
              onChange={onChange}
              onSave={onSave}
              saving={saving}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ShipmentEditor({
  form,
  onChange,
  onSave,
  saving,
}: {
  form: ShipmentInput;
  onChange: <K extends keyof ShipmentInput>(
    field: K,
    value: ShipmentInput[K],
  ) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const fields: Array<{
    field: keyof ShipmentInput;
    label: string;
    type?: string;
  }> = [
    { field: "shipmentReference", label: "Shipment reference" },
    { field: "containerNumber", label: "Container number" },
    { field: "bookingNumber", label: "Booking number" },
    { field: "billOfLadingReference", label: "Bill of lading" },
    { field: "carrier", label: "Carrier" },
    { field: "vesselName", label: "Vessel" },
    { field: "imoNumber", label: "IMO" },
    { field: "mmsiNumber", label: "MMSI" },
    { field: "originPortName", label: "Origin port" },
    { field: "destinationPortName", label: "Destination port" },
    { field: "customerId", label: "Customer ID" },
    { field: "customerContact", label: "Customer contact" },
    {
      field: "plannedDepartureAt",
      label: "Planned departure",
      type: "datetime-local",
    },
    {
      field: "plannedArrivalAt",
      label: "Planned arrival",
      type: "datetime-local",
    },
  ];
  return (
    <div className="ops-editor__grid">
      {fields.map(({ field, label, type = "text" }) => (
        <label key={field}>
          {label}
          <input
            type={type}
            value={String(form[field] ?? "")}
            onChange={(event) => onChange(field, event.target.value)}
          />
        </label>
      ))}
      <label>
        Priority
        <select
          value={form.priority ?? 3}
          onChange={(event) => onChange("priority", Number(event.target.value))}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select
          value={form.currentStatus ?? "planned"}
          onChange={(event) =>
            onChange(
              "currentStatus",
              event.target.value as ShipmentInput["currentStatus"],
            )
          }
        >
          {[
            "planned",
            "booked",
            "in_transit",
            "at_port",
            "delivered",
            "cancelled",
          ].map((value) => (
            <option key={value} value={value}>
              {value.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="ops-button ops-button--primary ops-editor__save"
        onClick={onSave}
        disabled={saving || !form.shipmentReference.trim()}
      >
        <Save aria-hidden="true" size={15} />
        {saving ? "Saving" : "Save shipment"}
      </button>
    </div>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
function Definition({ label, value }: { label: string; value?: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value || "Unavailable"}</dd>
    </>
  );
}
