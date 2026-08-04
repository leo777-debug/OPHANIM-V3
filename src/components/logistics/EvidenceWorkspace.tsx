"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, LoaderCircle } from "lucide-react";
import type { RescueCase } from "@/lib/logistics/rescue";
import { isoDate, label, requestJson } from "@/lib/logistics/client";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import EvidenceStatus from "./EvidenceStatus";

export default function EvidenceWorkspace() {
  const [cases, setCases] = useState<RescueCase[]>([]);
  const [selected, setSelected] = useState<RescueCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCases(
        (
          await requestJson<{ cases: RescueCase[] }>(
            "/api/logistics/rescue-cases",
          )
        ).cases,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load rescue evidence.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const open = async (id: string) => {
    if (!id) {
      setSelected(null);
      return;
    }
    setDetailLoading(true);
    setError("");
    try {
      setSelected(
        (
          await requestJson<{ rescueCase: RescueCase }>(
            `/api/logistics/rescue-cases/${id}`,
          )
        ).rescueCase,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load case evidence.",
      );
    } finally {
      setDetailLoading(false);
    }
  };
  return (
    <main className="ops-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">Evidence workspace</p>
            <h1>Evidence</h1>
            <p className="ops-page-header__detail">
              Verified links and user-captured records are shown separately from
              AI or calculated conclusions.
            </p>
          </div>
        </header>
        {error && (
          <section className="ops-section">
            <ErrorState message={error} onRetry={() => void load()} />
          </section>
        )}
        <section className="ops-section">
          <div className="ops-panel ops-evidence-selector">
            <label>
              Select rescue case
              <select
                value={selected?.id ?? ""}
                disabled={loading}
                onChange={(event) => void open(event.target.value)}
              >
                <option value="">Select a rescue case</option>
                {cases.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.shipmentReference} · {item.caseStatus}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {loading ? (
                <LoaderCircle
                  aria-hidden="true"
                  size={16}
                  className="animate-spin"
                />
              ) : (
                `${cases.length} rescue case${cases.length === 1 ? "" : "s"}`
              )}
            </span>
          </div>
        </section>
        {detailLoading && (
          <section className="ops-section">
            <div className="ops-panel">
              <EmptyState
                title="Loading case evidence"
                detail="Retrieving recorded evidence links for the selected rescue case."
              />
            </div>
          </section>
        )}
        {!loading && !selected && (
          <section className="ops-section">
            <div className="ops-panel">
              <EmptyState
                title="Select a rescue case"
                detail="Evidence aggregation is not exposed by the existing API, so this workspace retrieves real evidence for one rescue case at a time."
              />
            </div>
          </section>
        )}
        {selected && !detailLoading && (
          <section className="ops-section">
            <div className="ops-evidence-grid">
              <section className="ops-panel ops-detail-panel">
                <h2>{selected.shipmentReference}</h2>
                <p className="ops-muted">{selected.objective}</p>
                <EvidenceStatus
                  count={selected.evidence?.length ?? 0}
                  missing={!selected.evidence?.length}
                />
                <dl className="ops-definition-list">
                  <dt>Case status</dt>
                  <dd>{label(selected.caseStatus)}</dd>
                  <dt>Disruption</dt>
                  <dd>{selected.disruptionTitle ?? "Unavailable"}</dd>
                  <dt>Last updated</dt>
                  <dd>{isoDate(selected.updatedAt)}</dd>
                </dl>
                <Link
                  className="ops-button ops-button--secondary"
                  href="/logistics/rescue"
                >
                  Open rescue workspace
                </Link>
              </section>
              <section className="ops-panel ops-detail-panel">
                <h2>Evidence timeline</h2>
                {selected.evidence?.length ? (
                  <div className="ops-record-list">
                    {selected.evidence.map((item) => (
                      <a
                        key={item.id}
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <strong>{item.title}</strong>
                        <small>
                          {label(item.evidenceType)} · captured{" "}
                          {isoDate(item.capturedAt)}
                        </small>
                        <ExternalLink aria-hidden="true" size={14} />
                      </a>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No evidence recorded"
                    detail="Linked source evidence has not been captured for this rescue case."
                  />
                )}
              </section>
              <section className="ops-panel ops-detail-panel">
                <h2>Proof Pack</h2>
                <EmptyState
                  title="Proof Pack generation unavailable"
                  detail="The existing API stores individual rescue evidence links but does not expose a Proof Pack, document upload, or export workflow. No synthetic pack has been created."
                />
              </section>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
