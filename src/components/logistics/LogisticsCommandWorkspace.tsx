"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FileUp, RefreshCw } from "lucide-react";
import type { ShipmentRecord } from "@/lib/logistics/shipments";
import type { RescueCase } from "@/lib/logistics/rescue";
import type {
  IntelligenceAlert,
  OperationalTask,
} from "@/lib/intelligence/operations";
import { isoDate, requestJson } from "@/lib/logistics/client";
import ActionWindow from "./ActionWindow";
import DataFreshness from "./DataFreshness";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import OperationalStat from "./OperationalStat";
import SeverityBadge from "./SeverityBadge";
import ShipmentRoute from "./ShipmentRoute";

function isLogisticsTask(task: OperationalTask) {
  return (
    task.workflowType === "shipment_exposure" ||
    task.workflowType === "rescue_case"
  );
}

function taskRank(priority: OperationalTask["priority"]) {
  return (
    ({ critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>)[
      priority
    ] ?? 4
  );
}

export default function LogisticsCommandWorkspace() {
  const [shipments, setShipments] = useState<ShipmentRecord[]>([]);
  const [cases, setCases] = useState<RescueCase[]>([]);
  const [alerts, setAlerts] = useState<IntelligenceAlert[]>([]);
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [today, setToday] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [shipmentData, rescueData, alertData, taskData] = await Promise.all(
        [
          requestJson<{ shipments: ShipmentRecord[] }>(
            "/api/logistics/shipments",
          ),
          requestJson<{ cases: RescueCase[] }>("/api/logistics/rescue-cases"),
          requestJson<{ alerts: IntelligenceAlert[] }>(
            "/api/intelligence/alerts",
          ),
          requestJson<{ tasks: OperationalTask[] }>("/api/intelligence/tasks"),
        ],
      );
      setShipments(shipmentData.shipments);
      setCases(rescueData.cases);
      setAlerts(
        alertData.alerts.filter((alert) => alert.category === "logistics"),
      );
      setTasks(taskData.tasks.filter(isLogisticsTask));
      setUpdatedAt(new Date().toISOString());
      setToday(new Date().toISOString().slice(0, 10));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load the logistics command data.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const rescueNow = useMemo(
    () =>
      tasks
        .filter((task) => task.taskStatus !== "completed")
        .sort((a, b) => {
          const dateA = a.dueAt
            ? Date.parse(a.dueAt)
            : Number.POSITIVE_INFINITY;
          const dateB = b.dueAt
            ? Date.parse(b.dueAt)
            : Number.POSITIVE_INFINITY;
          return dateA - dateB || taskRank(a.priority) - taskRank(b.priority);
        }),
    [tasks],
  );
  const casesById = useMemo(
    () => new Map(cases.map((item) => [item.id, item])),
    [cases],
  );
  const shipmentsByReference = useMemo(
    () => new Map(shipments.map((item) => [item.shipmentReference, item])),
    [shipments],
  );
  const cutoffsToday = useMemo(
    () =>
      today
        ? rescueNow.filter((task) => task.dueAt?.slice(0, 10) === today).length
        : 0,
    [rescueNow, today],
  );

  return (
    <main className="ops-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">Operational workspace</p>
            <h1>Logistics Command</h1>
            <p className="ops-page-header__detail">
              UTC operational time · Data is displayed from your
              organization&apos;s recorded workflows.
            </p>
          </div>
          <div className="ops-page-header__actions">
            <DataFreshness
              updatedAt={updatedAt}
              onRefresh={() => void load()}
              busy={loading}
            />
            <Link href="/imports" className="ops-button ops-button--secondary">
              <FileUp aria-hidden="true" size={15} />
              Import Shipments
            </Link>
            <button
              type="button"
              className="ops-button ops-button--primary"
              disabled={loading}
              onClick={() => void load()}
            >
              <RefreshCw
                aria-hidden="true"
                size={15}
                className={loading ? "animate-spin" : ""}
              />
              Refresh
            </button>
          </div>
        </header>

        <section className="ops-stat-grid" aria-label="Operational summary">
          <OperationalStat
            label="Shipments needing action"
            value={rescueNow.length}
            detail="Open rescue and exposure tasks"
            href="#rescue-now"
            tone={rescueNow.length ? "critical" : "neutral"}
          />
          <OperationalStat
            label="Known task cutoffs today"
            value={cutoffsToday}
            detail="Only tasks with recorded deadlines"
            href="#rescue-now"
            tone={cutoffsToday ? "attention" : "neutral"}
          />
          <OperationalStat
            label="Replies overdue"
            value="--"
            detail="Response records are not available"
            href="/logistics/waiting-replies"
          />
          <OperationalStat
            label="Broken handoffs"
            value="--"
            detail="Ownership-gap records are not available"
            href="#handoffs"
          />
          <OperationalStat
            label="Shipments monitored"
            value={alerts.length}
            detail="Active logistics intelligence alerts"
            href="#monitoring"
          />
        </section>

        {error && (
          <section className="ops-section">
            <ErrorState message={error} onRetry={() => void load()} />
          </section>
        )}

        <section className="ops-section" id="rescue-now">
          <div className="ops-section__header">
            <div>
              <h2>Rescue Now</h2>
              <p>
                Ordered by known task deadline and backend priority. Missing
                deadlines remain explicitly unavailable.
              </p>
            </div>
            <Link
              className="ops-button ops-button--secondary"
              href="/logistics/rescue"
            >
              All rescue cases <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          </div>
          <div className="ops-panel ops-list">
            {loading ? (
              <EmptyState
                title="Loading urgent work"
                detail="Retrieving organization-scoped rescue and exposure tasks."
              />
            ) : rescueNow.length === 0 ? (
              <EmptyState
                title="No urgent shipments"
                detail="No active shipment task currently requires immediate intervention."
                action={
                  <Link
                    className="ops-button ops-button--secondary"
                    href="/logistics/disruptions"
                  >
                    Review disruptions
                  </Link>
                }
              />
            ) : (
              rescueNow.slice(0, 8).map((task) => {
                const rescueCase =
                  task.workflowType === "rescue_case"
                    ? casesById.get(task.workflowId)
                    : undefined;
                const shipment = rescueCase
                  ? shipmentsByReference.get(rescueCase.shipmentReference)
                  : undefined;
                return (
                  <article key={task.id} className="ops-list-row">
                    <div className="ops-list-row__title">
                      <span>{rescueCase?.shipmentReference ?? task.title}</span>
                      <span className="ops-list-row__detail">
                        {shipment?.containerNumber
                          ? `Container ${shipment.containerNumber}`
                          : "Shipment detail unavailable from task record"}
                      </span>
                    </div>
                    <div>
                      <ShipmentRoute
                        origin={shipment?.originPortName}
                        destination={shipment?.destinationPortName}
                        transshipments={shipment?.transshipmentPorts}
                      />
                      <p className="ops-list-row__detail">
                        {rescueCase?.disruptionTitle ??
                          "Current disruption is not recorded on this task"}
                      </p>
                    </div>
                    <div>
                      <SeverityBadge value={task.priority} />
                      <p className="ops-list-row__detail">
                        Owner is not exposed by the current task API
                      </p>
                    </div>
                    <div>
                      <ActionWindow
                        deadline={task.dueAt}
                        label="Known task deadline"
                      />
                    </div>
                    <div className="ops-list-row__actions">
                      {rescueCase ? (
                        <Link
                          className="ops-button ops-button--primary"
                          href="/logistics/rescue"
                        >
                          Open rescue
                        </Link>
                      ) : (
                        <Link
                          className="ops-button ops-button--secondary"
                          href="/logistics/notifications"
                        >
                          Review alert
                        </Link>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>

        <section className="ops-section" id="handoffs">
          <div className="ops-section__header">
            <div>
              <h2>Broken Handoffs</h2>
              <p>
                Ownership gaps require completed-milestone and next-action
                records that are not exposed by the current API.
              </p>
            </div>
          </div>
          <div className="ops-panel">
            <EmptyState
              title="Handoff assessment unavailable"
              detail="Ophanim will not infer a broken handoff from shipment status alone. Add a backend handoff record source before enabling this operational view."
            />
          </div>
        </section>

        <section className="ops-section" id="monitoring">
          <div className="ops-section__header">
            <div>
              <h2>Monitoring</h2>
              <p>
                Possible logistics exposure signals remain distinct from
                confirmed impact.
              </p>
            </div>
            <Link
              className="ops-button ops-button--secondary"
              href="/logistics/notifications"
            >
              Open notifications <ArrowUpRight aria-hidden="true" size={14} />
            </Link>
          </div>
          <div className="ops-panel ops-list">
            {loading ? (
              <EmptyState
                title="Loading monitored signals"
                detail="Retrieving active logistics alerts."
              />
            ) : alerts.length === 0 ? (
              <EmptyState
                title="No monitored shipments"
                detail="No active logistics intelligence alerts are recorded for this organization."
              />
            ) : (
              alerts.slice(0, 6).map((alert) => (
                <article key={alert.id} className="ops-list-row">
                  <div className="ops-list-row__title">
                    <span>{alert.subjectLabel}</span>
                    <span className="ops-list-row__detail">{alert.title}</span>
                  </div>
                  <div>
                    <p className="ops-list-row__detail">{alert.summary}</p>
                  </div>
                  <div>
                    <SeverityBadge value={alert.confidenceLevel} />
                    <p className="ops-list-row__detail">
                      {alert.confidenceScore}% source confidence
                    </p>
                  </div>
                  <div>
                    <p className="ops-list-row__detail">
                      Updated {isoDate(alert.updatedAt)}
                    </p>
                  </div>
                  <div className="ops-list-row__actions">
                    <Link
                      className="ops-button ops-button--secondary"
                      href="/logistics/notifications"
                    >
                      Review
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
