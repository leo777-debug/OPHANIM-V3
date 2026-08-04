"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, MapPinned, Plus, RefreshCw, Save } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { DisruptionInput } from "@/lib/logistics/disruption-validation";
import type {
  DisruptionRecord,
  ShipmentImpactAssessment,
} from "@/lib/logistics/disruptions";
import {
  hrefForMap,
  isoDate,
  label,
  requestJson,
} from "@/lib/logistics/client";
import EmptyState from "./logistics/EmptyState";
import ErrorState from "./logistics/ErrorState";
import ExposureBadge from "./logistics/ExposureBadge";
import SeverityBadge from "./logistics/SeverityBadge";

const blank: DisruptionInput = {
  source: "",
  title: "",
  disruptionType: "port_closure",
  severity: 3,
  status: "active",
};

export default function DisruptionWorkspace() {
  const router = useRouter();
  const query = useSearchParams();
  const [disruptions, setDisruptions] = useState<DisruptionRecord[]>([]);
  const [selected, setSelected] = useState<DisruptionRecord | null>(null);
  const [assessments, setAssessments] = useState<ShipmentImpactAssessment[]>(
    [],
  );
  const [form, setForm] = useState<DisruptionInput>(blank);
  const [ports, setPorts] = useState("");
  const [vessels, setVessels] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDisruptions(
        (
          await requestJson<{ disruptions: DisruptionRecord[] }>(
            "/api/logistics/disruptions",
          )
        ).disruptions,
      );
    } catch (cause) {
      if (
        cause instanceof Error &&
        cause.message === "Authentication is required."
      )
        router.replace("/login");
      else
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load disruptions.",
        );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  useEffect(() => {
    const id = query.get("selected");
    if (id) void openById(id);
  }, [query]);

  async function openById(id: string) {
    setSaving(true);
    setError("");
    try {
      const detail = await requestJson<{
        disruption: DisruptionRecord;
        assessments: ShipmentImpactAssessment[];
      }>(`/api/logistics/disruptions/${id}`);
      setSelected(detail.disruption);
      setAssessments(detail.assessments);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to open disruption.",
      );
    } finally {
      setSaving(false);
    }
  }
  const split = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const create = async () => {
    setSaving(true);
    setError("");
    try {
      const created = await requestJson<{ disruption: DisruptionRecord }>(
        "/api/logistics/disruptions",
        {
          method: "POST",
          body: JSON.stringify({
            ...form,
            affectedPorts: split(ports),
            affectedVessels: split(vessels),
            evidence: evidenceUrl.trim()
              ? [
                  {
                    sourceName: form.source,
                    title: form.title,
                    sourceUrl: evidenceUrl.trim(),
                  },
                ]
              : undefined,
          }),
        },
      );
      setForm(blank);
      setPorts("");
      setVessels("");
      setEvidenceUrl("");
      setShowCreate(false);
      await load();
      await openById(created.disruption.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to record disruption.",
      );
    } finally {
      setSaving(false);
    }
  };
  const reconcile = async () => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      setAssessments(
        (
          await requestJson<{ assessments: ShipmentImpactAssessment[] }>(
            `/api/logistics/disruptions/${selected.id}/reconcile`,
            { method: "POST", body: "{}" },
          )
        ).assessments,
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to reconcile shipment impacts.",
      );
    } finally {
      setSaving(false);
    }
  };
  const sync = async () => {
    setSyncing(true);
    setError("");
    try {
      const response = await requestJson<{ errors: string[] }>(
        "/api/logistics/disruptions/manual-sync",
        { method: "POST", body: "{}" },
      );
      await load();
      if (response.errors.length) setError(response.errors.join(" "));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to sync logistics feeds.",
      );
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="ops-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">
              Operational disruption feed
            </p>
            <h1>Disruptions</h1>
            <p className="ops-page-header__detail">
              Logistics-relevant interruptions and deterministic shipment
              matches, ordered by source severity and current status.
            </p>
          </div>
          <div className="ops-page-header__actions">
            <button
              type="button"
              className="ops-button ops-button--secondary"
              onClick={() => void sync()}
              disabled={syncing}
            >
              <RefreshCw
                aria-hidden="true"
                size={15}
                className={syncing ? "animate-spin" : ""}
              />
              Sync live feeds
            </button>
            <button
              type="button"
              className="ops-button ops-button--primary"
              onClick={() => setShowCreate((open) => !open)}
            >
              <Plus aria-hidden="true" size={15} />
              Record disruption
            </button>
          </div>
        </header>
        {error && (
          <section className="ops-section">
            <ErrorState message={error} onRetry={() => void load()} />
          </section>
        )}
        {showCreate && (
          <section className="ops-section">
            <div className="ops-panel ops-editor">
              <div className="ops-section__header">
                <div>
                  <h2>Record logistics disruption</h2>
                  <p>
                    Manual records are organization-scoped and retain source
                    attribution.
                  </p>
                </div>
              </div>
              <div className="ops-editor__grid">
                <Field
                  label="Source"
                  value={form.source}
                  onChange={(source) =>
                    setForm((current) => ({ ...current, source }))
                  }
                />
                <Field
                  label="Title"
                  value={form.title}
                  onChange={(title) =>
                    setForm((current) => ({ ...current, title }))
                  }
                />
                <label>
                  Category
                  <select
                    value={form.disruptionType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        disruptionType: event.target
                          .value as DisruptionInput["disruptionType"],
                      }))
                    }
                  >
                    {[
                      "port_closure",
                      "congestion",
                      "severe_weather",
                      "strike",
                      "customs_outage",
                      "terminal_outage",
                      "vessel_diversion",
                      "maritime_security_incident",
                      "chokepoint_disruption",
                      "infrastructure_failure",
                      "other",
                    ].map((type) => (
                      <option key={type} value={type}>
                        {label(type)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Severity
                  <select
                    value={form.severity}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        severity: Number(event.target.value),
                      }))
                    }
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <Field
                  label="Affected ports (comma separated)"
                  value={ports}
                  onChange={setPorts}
                />
                <Field
                  label="Affected vessels or IMOs (comma separated)"
                  value={vessels}
                  onChange={setVessels}
                />
                <Field
                  label="Source URL"
                  value={evidenceUrl}
                  onChange={setEvidenceUrl}
                  type="url"
                />
                <button
                  type="button"
                  className="ops-button ops-button--primary ops-editor__save"
                  onClick={() => void create()}
                  disabled={saving || !form.source.trim() || !form.title.trim()}
                >
                  <Save aria-hidden="true" size={15} />
                  {saving ? "Saving" : "Save disruption"}
                </button>
              </div>
            </div>
          </section>
        )}
        <section className="ops-section">
          <div className="ops-section__header">
            <div>
              <h2>Relevant disruption feed</h2>
              <p>Source confidence and potential impact are kept distinct.</p>
            </div>
          </div>
          <div className="ops-panel ops-list">
            {loading ? (
              <EmptyState
                title="Loading disruptions"
                detail="Retrieving organization-scoped disruptions."
              />
            ) : disruptions.length === 0 ? (
              <EmptyState
                title="No disruptions recorded"
                detail="No logistics disruptions are currently recorded for this organization."
              />
            ) : (
              disruptions.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`ops-disruption-row${selected?.id === item.id ? " is-active" : ""}`}
                  onClick={() => void openById(item.id)}
                >
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.source} · {label(item.disruptionType)} ·{" "}
                      {isoDate(item.effectiveAt ?? item.reportedAt)}
                    </small>
                  </span>
                  <SeverityBadge
                    value={
                      item.severity >= 5
                        ? "critical"
                        : item.severity >= 4
                          ? "high"
                          : item.severity >= 3
                            ? "medium"
                            : "low"
                    }
                  />
                  <span className="ops-disruption-row__count">
                    {item.impactCount ?? 0} potential impact
                    {item.impactCount === 1 ? "" : "s"}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>
        {selected && (
          <section className="ops-section">
            <header className="ops-section__header">
              <div>
                <h2>{selected.title}</h2>
                <p>
                  {selected.description ||
                    "No additional source description recorded."}
                </p>
              </div>
              <div className="ops-page-header__actions">
                <Link
                  href={hrefForMap(undefined, selected.id)}
                  className="ops-button ops-button--secondary"
                >
                  <MapPinned aria-hidden="true" size={15} />
                  Open on map
                </Link>
                <button
                  type="button"
                  className="ops-button ops-button--primary"
                  onClick={() => void reconcile()}
                  disabled={saving}
                >
                  <RefreshCw aria-hidden="true" size={15} />
                  Reconcile impacts
                </button>
              </div>
            </header>
            <div className="ops-disruption-detail">
              <section className="ops-panel ops-detail-panel">
                <h2>Source evidence</h2>
                {selected.evidence?.length ? (
                  <div className="ops-record-list">
                    {selected.evidence.map((evidence) => (
                      <a
                        key={evidence.id}
                        href={evidence.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <strong>{evidence.title}</strong>
                        <small>
                          {evidence.sourceName} · {isoDate(evidence.capturedAt)}
                        </small>
                      </a>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No source evidence recorded"
                    detail="This disruption currently has no linked source record."
                  />
                )}
                {selected.sourceUrl && (
                  <a
                    className="ops-button ops-button--secondary"
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink aria-hidden="true" size={14} />
                    Primary source
                  </a>
                )}
              </section>
              <section className="ops-panel ops-detail-panel">
                <h2>Potentially affected shipments</h2>
                {assessments.length ? (
                  <div className="ops-list">
                    {assessments.map((assessment) => (
                      <article key={assessment.id} className="ops-impact-row">
                        <div>
                          <Link
                            className="ops-table-link"
                            href={`/logistics/shipments/${assessment.shipmentId}`}
                          >
                            {assessment.shipmentReference}
                          </Link>
                          <small>
                            {assessment.matchedSignals
                              .map((signal) => signal.value)
                              .join(", ") || "Match details unavailable"}
                          </small>
                        </div>
                        <ExposureBadge
                          status={assessment.impactStatus}
                          confidence={assessment.confidence}
                        />
                        <SeverityBadge value={assessment.riskLevel} />
                        <span className="ops-list-row__detail">
                          Last safe move:{" "}
                          {assessment.lastSafeMoveAt
                            ? isoDate(assessment.lastSafeMoveAt)
                            : "Unavailable"}
                        </span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No assessed shipments"
                    detail="Run the deterministic reconciliation to create or refresh organization-scoped impact assessments."
                  />
                )}
              </section>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Field({
  label: fieldLabel,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label>
      {fieldLabel}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type={type}
      />
    </label>
  );
}
