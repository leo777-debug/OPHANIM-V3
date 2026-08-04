"use client";

import { type ReactNode, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FilePlus2, Plus, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ShipmentRecord } from "@/lib/logistics/shipments";
import type { DisruptionRecord } from "@/lib/logistics/disruptions";
import type {
  RescueAction,
  RescueCase,
  RescueDecisionRecord,
  RescueEvidenceRecord,
} from "@/lib/logistics/rescue";
import {
  hrefForMap,
  isoDate,
  label,
  requestJson,
} from "@/lib/logistics/client";
import ActionWindow from "./logistics/ActionWindow";
import EmptyState from "./logistics/EmptyState";
import ErrorState from "./logistics/ErrorState";
import EvidenceStatus from "./logistics/EvidenceStatus";
import RescueStatus from "./logistics/RescueStatus";
import ShipmentRoute from "./logistics/ShipmentRoute";

export default function RescueWorkspace() {
  const router = useRouter();
  const [cases, setCases] = useState<RescueCase[]>([]);
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [disruptions, setDisruptions] = useState<DisruptionRecord[]>([]);
  const [selected, setSelected] = useState<RescueCase | null>(null);
  const [shipmentId, setShipmentId] = useState("");
  const [disruptionId, setDisruptionId] = useState("");
  const [objective, setObjective] = useState("");
  const [actionType, setActionType] = useState("reroute");
  const [actionTitle, setActionTitle] = useState("");
  const [targetAt, setTargetAt] = useState("");
  const [decision, setDecision] = useState("approved");
  const [rationale, setRationale] = useState("");
  const [evidenceType, setEvidenceType] = useState("source");
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [caseData, shipmentData, disruptionData] = await Promise.all([
        requestJson<{ cases: RescueCase[] }>("/api/logistics/rescue-cases"),
        requestJson<{ shipments: ShipmentRecord[] }>(
          "/api/logistics/shipments",
        ),
        requestJson<{ disruptions: DisruptionRecord[] }>(
          "/api/logistics/disruptions",
        ),
      ]);
      setCases(caseData.cases);
      setShipments(shipmentData.shipments);
      setDisruptions(disruptionData.disruptions);
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
            : "Unable to load rescue cases.",
        );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const open = async (rescueCase: RescueCase) => {
    setSaving(true);
    setError("");
    try {
      const data = await requestJson<{ rescueCase: RescueCase }>(
        `/api/logistics/rescue-cases/${rescueCase.id}`,
      );
      setSelected(data.rescueCase);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to open rescue case.",
      );
    } finally {
      setSaving(false);
    }
  };

  const run = async (operation: () => Promise<void>) => {
    setSaving(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Rescue workflow update failed.",
      );
    } finally {
      setSaving(false);
    }
  };
  const reloadSelected = async (id: string) => open({ id } as RescueCase);
  const create = () =>
    run(async () => {
      const data = await requestJson<{ rescueCase: RescueCase }>(
        "/api/logistics/rescue-cases",
        {
          method: "POST",
          body: JSON.stringify({
            shipmentId,
            disruptionId: disruptionId || undefined,
            objective,
          }),
        },
      );
      setObjective("");
      await load();
      await reloadSelected(data.rescueCase.id);
    });
  const addAction = () =>
    run(async () => {
      if (!selected) return;
      await requestJson(`/api/logistics/rescue-cases/${selected.id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          actionType,
          title: actionTitle,
          targetAt: targetAt || undefined,
        }),
      });
      setActionTitle("");
      setTargetAt("");
      await reloadSelected(selected.id);
    });
  const addDecision = () =>
    run(async () => {
      if (!selected) return;
      await requestJson(
        `/api/logistics/rescue-cases/${selected.id}/decisions`,
        { method: "POST", body: JSON.stringify({ decision, rationale }) },
      );
      setRationale("");
      await reloadSelected(selected.id);
    });
  const addEvidence = () =>
    run(async () => {
      if (!selected) return;
      await requestJson(`/api/logistics/rescue-cases/${selected.id}/evidence`, {
        method: "POST",
        body: JSON.stringify({
          evidenceType,
          title: evidenceTitle,
          sourceUrl: evidenceUrl,
        }),
      });
      setEvidenceTitle("");
      setEvidenceUrl("");
      await reloadSelected(selected.id);
    });
  const setStatus = (caseStatus: string) =>
    run(async () => {
      if (!selected) return;
      const data = await requestJson<{ rescueCase: RescueCase }>(
        `/api/logistics/rescue-cases/${selected.id}`,
        { method: "PATCH", body: JSON.stringify({ caseStatus }) },
      );
      setSelected(data.rescueCase);
      await load();
    });

  const shipment = selected
    ? shipments.find((item) => item.id === selected.shipmentId)
    : undefined;

  return (
    <main className="ops-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">Operational recovery</p>
            <h1>Rescue Cases</h1>
            <p className="ops-page-header__detail">
              Turn evidence-led alerts into an assigned recovery workflow.
              Ownership and contact records are shown only where the API exposes
              them.
            </p>
          </div>
          <button
            type="button"
            className="ops-button ops-button--primary"
            onClick={() =>
              document
                .getElementById("open-rescue-case")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <Plus aria-hidden="true" size={15} />
            Open case
          </button>
        </header>
        {error && (
          <section className="ops-section">
            <ErrorState message={error} onRetry={() => void load()} />
          </section>
        )}
        <section className="ops-section ops-rescue-layout">
          <section className="ops-panel">
            <div className="ops-panel-heading">
              <div>
                <h2>Active rescue cases</h2>
                <p>Open a case to work its actions, decisions, and evidence.</p>
              </div>
            </div>
            <div className="ops-list">
              {loading ? (
                <EmptyState
                  title="Loading rescue cases"
                  detail="Retrieving rescue workflows."
                />
              ) : cases.length === 0 ? (
                <EmptyState
                  title="No rescue cases"
                  detail="No shipment recovery workflow has been recorded."
                />
              ) : (
                cases.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`ops-case-row${selected?.id === item.id ? " is-active" : ""}`}
                    onClick={() => void open(item)}
                  >
                    <span>
                      <strong>{item.shipmentReference}</strong>
                      <small>{item.objective}</small>
                    </span>
                    <RescueStatus status={item.caseStatus} />
                  </button>
                ))
              )}
            </div>
          </section>
          <section className="ops-panel ops-open-case" id="open-rescue-case">
            <div className="ops-panel-heading">
              <div>
                <h2>Open rescue case</h2>
                <p>Creates a real organization-scoped workflow.</p>
              </div>
            </div>
            <div className="ops-form-stack">
              <Field label="Shipment">
                <select
                  value={shipmentId}
                  onChange={(event) => setShipmentId(event.target.value)}
                >
                  <option value="">Select shipment</option>
                  {shipments.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.shipmentReference}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Triggering disruption">
                <select
                  value={disruptionId}
                  onChange={(event) => setDisruptionId(event.target.value)}
                >
                  <option value="">No linked disruption</option>
                  {disruptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Objective">
                <input
                  value={objective}
                  onChange={(event) => setObjective(event.target.value)}
                  placeholder="Protect the next known shipment movement"
                />
              </Field>
              <button
                type="button"
                className="ops-button ops-button--primary"
                disabled={saving || !shipmentId || !objective.trim()}
                onClick={create}
              >
                <FilePlus2 aria-hidden="true" size={15} />
                Open case
              </button>
            </div>
          </section>
        </section>
        {selected && (
          <section className="ops-section">
            <header className="ops-rescue-header">
              <div>
                <p className="ops-page-header__eyebrow">
                  {label(selected.caseStatus)}
                </p>
                <h2>{selected.shipmentReference}</h2>
                <p>{selected.objective}</p>
              </div>
              <div className="ops-rescue-header__actions">
                <RescueStatus status={selected.caseStatus} />
                <select
                  value={selected.caseStatus}
                  onChange={(event) => setStatus(event.target.value)}
                  disabled={saving}
                  aria-label="Rescue case status"
                >
                  {[
                    "open",
                    "assessing",
                    "awaiting_approval",
                    "executing",
                    "recovered",
                    "closed",
                  ].map((status) => (
                    <option key={status} value={status}>
                      {label(status)}
                    </option>
                  ))}
                </select>
                <Link
                  href={hrefForMap(selected.shipmentId, selected.disruptionId)}
                  className="ops-button ops-button--secondary"
                >
                  Open on map
                </Link>
              </div>
            </header>
            <div className="ops-rescue-workspace">
              <section className="ops-panel ops-work-panel">
                <div className="ops-panel-heading">
                  <div>
                    <h2>Actions and tasks</h2>
                    <p>Actions are the existing rescue-task records.</p>
                  </div>
                </div>
                <div className="ops-form-inline">
                  <select
                    value={actionType}
                    onChange={(event) => setActionType(event.target.value)}
                    aria-label="Action type"
                  >
                    {[
                      "reroute",
                      "rebook",
                      "hold",
                      "carrier_contact",
                      "port_contact",
                      "customs",
                      "customer_update",
                      "procurement",
                      "other",
                    ].map((type) => (
                      <option key={type} value={type}>
                        {label(type)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={actionTitle}
                    onChange={(event) => setActionTitle(event.target.value)}
                    placeholder="Action title"
                    aria-label="Action title"
                  />
                  <input
                    value={targetAt}
                    onChange={(event) => setTargetAt(event.target.value)}
                    type="datetime-local"
                    aria-label="Known action deadline"
                  />
                  <button
                    type="button"
                    className="ops-button ops-button--primary"
                    disabled={saving || !actionTitle.trim()}
                    onClick={addAction}
                  >
                    <Plus aria-hidden="true" size={15} />
                    Add task
                  </button>
                </div>
                <div className="ops-list">
                  {(selected.actions ?? []).length === 0 ? (
                    <EmptyState
                      title="No rescue actions"
                      detail="Add a concrete recovery action when it has been assigned."
                    />
                  ) : (
                    selected.actions?.map((action: RescueAction) => (
                      <article key={action.id} className="ops-action-row">
                        <div>
                          <strong>{action.title}</strong>
                          <small>
                            {label(action.actionType)} ·{" "}
                            {label(action.actionStatus)}
                          </small>
                        </div>
                        <ActionWindow
                          deadline={action.targetAt}
                          label="Known action deadline"
                        />
                      </article>
                    ))
                  )}
                </div>
              </section>
              <aside className="ops-rescue-support">
                <section className="ops-panel ops-work-panel">
                  <div className="ops-panel-heading">
                    <div>
                      <h2>Shipment context</h2>
                    </div>
                  </div>
                  <ShipmentRoute
                    origin={shipment?.originPortName}
                    destination={shipment?.destinationPortName}
                    transshipments={shipment?.transshipmentPorts}
                  />
                  <dl className="ops-definition-list">
                    <Definition
                      label="Current milestone"
                      value={shipment?.currentStatus?.replaceAll("_", " ")}
                    />
                    <Definition label="Carrier" value={shipment?.carrier} />
                    <Definition label="Vessel" value={shipment?.vesselName} />
                    <Definition
                      label="Disruption"
                      value={selected.disruptionTitle}
                    />
                    <Definition
                      label="Owner"
                      value="Not exposed by the rescue API"
                    />
                  </dl>
                  <EvidenceStatus
                    count={selected.evidence?.length ?? 0}
                    missing={!selected.evidence?.length}
                  />
                </section>
                <section className="ops-panel ops-work-panel">
                  <div className="ops-panel-heading">
                    <div>
                      <h2>Missing workflow records</h2>
                    </div>
                  </div>
                  <p className="ops-muted">
                    Contacts, calls, messages, and uploaded binary documents are
                    not exposed by the existing rescue API. This workspace does
                    not create placeholder activity.
                  </p>
                </section>
              </aside>
              <section className="ops-panel ops-work-panel ops-rescue-activity">
                <div className="ops-panel-heading">
                  <div>
                    <h2>Decisions and evidence</h2>
                    <p>
                      Recorded decisions and linked source evidence remain
                      separate.
                    </p>
                  </div>
                </div>
                <div className="ops-activity-grid">
                  <div>
                    <h3>Record decision</h3>
                    <div className="ops-form-stack">
                      <select
                        value={decision}
                        onChange={(event) => setDecision(event.target.value)}
                        aria-label="Decision"
                      >
                        {["approved", "rejected", "hold", "note"].map(
                          (option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ),
                        )}
                      </select>
                      <input
                        value={rationale}
                        onChange={(event) => setRationale(event.target.value)}
                        placeholder="Decision rationale"
                      />
                      <button
                        type="button"
                        className="ops-button ops-button--secondary"
                        disabled={saving || !rationale.trim()}
                        onClick={addDecision}
                      >
                        <CheckCircle2 aria-hidden="true" size={15} />
                        Record decision
                      </button>
                    </div>
                    <div className="ops-record-list">
                      {(selected.decisions ?? []).map(
                        (item: RescueDecisionRecord) => (
                          <p key={item.id}>
                            <strong>{item.decision}</strong> {item.rationale}
                            <small>{isoDate(item.recordedAt)}</small>
                          </p>
                        ),
                      )}
                    </div>
                  </div>
                  <div>
                    <h3>Capture linked evidence</h3>
                    <div className="ops-form-stack">
                      <select
                        value={evidenceType}
                        onChange={(event) =>
                          setEvidenceType(event.target.value)
                        }
                        aria-label="Evidence type"
                      >
                        {[
                          "source",
                          "carrier_notice",
                          "customer_notice",
                          "quote",
                          "approval",
                          "document",
                          "other",
                        ].map((option) => (
                          <option key={option} value={option}>
                            {label(option)}
                          </option>
                        ))}
                      </select>
                      <input
                        value={evidenceTitle}
                        onChange={(event) =>
                          setEvidenceTitle(event.target.value)
                        }
                        placeholder="Evidence title"
                      />
                      <input
                        value={evidenceUrl}
                        onChange={(event) => setEvidenceUrl(event.target.value)}
                        placeholder="https:// source URL"
                        type="url"
                      />
                      <button
                        type="button"
                        className="ops-button ops-button--secondary"
                        disabled={
                          saving || !evidenceTitle.trim() || !evidenceUrl.trim()
                        }
                        onClick={addEvidence}
                      >
                        <ShieldCheck aria-hidden="true" size={15} />
                        Capture evidence
                      </button>
                    </div>
                    <div className="ops-record-list">
                      {(selected.evidence ?? []).map(
                        (item: RescueEvidenceRecord) => (
                          <a
                            key={item.id}
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <strong>{item.title}</strong>
                            <small>
                              {label(item.evidenceType)} ·{" "}
                              {isoDate(item.capturedAt)}
                            </small>
                          </a>
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
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
