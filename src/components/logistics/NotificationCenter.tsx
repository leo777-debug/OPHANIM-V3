"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Check, Clock3, Mail, RefreshCw } from "lucide-react";
import type {
  IntelligenceAlert,
  IntelligenceDeliveryLog,
  OperationalTask,
} from "@/lib/intelligence/operations";
import { isoDate, label, requestJson } from "@/lib/logistics/client";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import SeverityBadge from "./SeverityBadge";

function oneHourFromNow() {
  return new Date(Date.now() + 3_600_000).toISOString();
}

export default function NotificationCenter() {
  const [alerts, setAlerts] = useState<IntelligenceAlert[]>([]);
  const [tasks, setTasks] = useState<OperationalTask[]>([]);
  const [deliveries, setDeliveries] = useState<IntelligenceDeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [alertData, taskData, deliveryData] = await Promise.all([
        requestJson<{ alerts: IntelligenceAlert[] }>(
          "/api/intelligence/alerts",
        ),
        requestJson<{ tasks: OperationalTask[] }>("/api/intelligence/tasks"),
        requestJson<{ deliveries: IntelligenceDeliveryLog[] }>(
          "/api/intelligence/deliveries",
        ),
      ]);
      setAlerts(
        alertData.alerts.filter((item) => item.category === "logistics"),
      );
      setTasks(
        taskData.tasks.filter(
          (item) =>
            item.workflowType === "shipment_exposure" ||
            item.workflowType === "rescue_case",
        ),
      );
      setDeliveries(deliveryData.deliveries);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load operational notifications.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const update = async (
    id: string,
    status: "acknowledged" | "snoozed" | "closed",
  ) => {
    setBusy(true);
    setError("");
    try {
      await requestJson(`/api/intelligence/alerts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(
          status === "snoozed"
            ? {
                status,
                snoozedUntil: oneHourFromNow(),
              }
            : { status },
        ),
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to update the alert.",
      );
    } finally {
      setBusy(false);
    }
  };
  const deadlineTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.dueAt && task.taskStatus !== "completed")
        .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? "")),
    [tasks],
  );
  return (
    <main className="ops-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">
              Operational notification center
            </p>
            <h1>Notifications</h1>
            <p className="ops-page-header__detail">
              Direct actions remain adjacent to the operational record. The API
              does not expose assignment actions for alerts.
            </p>
          </div>
          <button
            type="button"
            className="ops-button ops-button--secondary"
            onClick={() => void load()}
            disabled={loading || busy}
          >
            <RefreshCw
              aria-hidden="true"
              size={15}
              className={loading ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </header>
        {error && (
          <section className="ops-section">
            <ErrorState message={error} onRetry={() => void load()} />
          </section>
        )}
        <section className="ops-section">
          <div className="ops-notification-grid">
            <section className="ops-panel ops-detail-panel">
              <div className="ops-panel-heading">
                <div>
                  <h2>Urgent action</h2>
                  <p>
                    Open logistics alerts from recorded intelligence
                    assessments.
                  </p>
                </div>
              </div>
              {loading ? (
                <EmptyState
                  title="Loading alerts"
                  detail="Retrieving operational logistics alerts."
                />
              ) : alerts.length === 0 ? (
                <EmptyState
                  title="No active logistics alerts"
                  detail="No operational intelligence alert currently needs acknowledgement."
                />
              ) : (
                <div className="ops-alert-list">
                  {alerts.map((alert) => (
                    <article key={alert.id}>
                      <div>
                        <span className="ops-alert-list__title">
                          <Bell aria-hidden="true" size={15} />
                          {alert.subjectLabel}
                        </span>
                        <p>{alert.summary}</p>
                        <small>
                          {alert.sourceName} · {isoDate(alert.updatedAt)}
                        </small>
                      </div>
                      <SeverityBadge value={alert.confidenceLevel} />
                      <div className="ops-list-row__actions">
                        <button
                          type="button"
                          className="ops-button ops-button--secondary"
                          disabled={busy}
                          onClick={() => void update(alert.id, "acknowledged")}
                        >
                          <Check aria-hidden="true" size={14} />
                          Acknowledge
                        </button>
                        <button
                          type="button"
                          className="ops-button ops-button--secondary"
                          disabled={busy}
                          onClick={() => void update(alert.id, "snoozed")}
                        >
                          Snooze 1h
                        </button>
                        <Link
                          className="ops-button ops-button--secondary"
                          href="/logistics/rescue"
                        >
                          Open rescue
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="ops-panel ops-detail-panel">
              <div className="ops-panel-heading">
                <div>
                  <h2>Known task deadlines</h2>
                  <p>
                    Only backend-provided operational task deadlines appear
                    here.
                  </p>
                </div>
              </div>
              {loading ? (
                <EmptyState
                  title="Loading task deadlines"
                  detail="Retrieving open logistics tasks."
                />
              ) : deadlineTasks.length === 0 ? (
                <EmptyState
                  title="No known task deadlines"
                  detail="No open logistics task has a recorded due time."
                />
              ) : (
                <div className="ops-record-list">
                  {deadlineTasks.map((task) => (
                    <div key={task.id}>
                      <strong>{task.title}</strong>
                      <small>
                        <Clock3 aria-hidden="true" size={13} />
                        {isoDate(task.dueAt)} · {label(task.priority)}
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="ops-panel ops-detail-panel">
              <div className="ops-panel-heading">
                <div>
                  <h2>Email delivery log</h2>
                  <p>
                    Delivery attempts are emitted by the existing Resend
                    workflow.
                  </p>
                </div>
              </div>
              {loading ? (
                <EmptyState
                  title="Loading delivery log"
                  detail="Retrieving email delivery records."
                />
              ) : deliveries.length === 0 ? (
                <EmptyState
                  title="No delivery attempts"
                  detail="No alert email delivery has been recorded yet."
                />
              ) : (
                <div className="ops-record-list">
                  {deliveries.slice(0, 25).map((delivery) => (
                    <div key={delivery.id}>
                      <strong>
                        <Mail aria-hidden="true" size={13} />
                        {delivery.subjectLabel}
                      </strong>
                      <small>
                        {delivery.kind} · {delivery.status} ·{" "}
                        {delivery.attempts} attempt
                        {delivery.attempts === 1 ? "" : "s"} ·{" "}
                        {isoDate(delivery.sentAt ?? delivery.createdAt)}
                      </small>
                      {delivery.error && <em>{delivery.error}</em>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
