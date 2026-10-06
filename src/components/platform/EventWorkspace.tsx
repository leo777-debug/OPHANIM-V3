"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  CloudOff,
  Database,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";

type EventRecord = {
  id: string;
  organizationId: string | null;
  visibility: "global" | "organization_private";
  title: string;
  summary: string;
  eventType: string;
  category: string;
  status: string;
  severity: number | null;
  confidence: number | null;
  verificationState: "confirmed" | "likely" | "unverified" | "conflicting";
  primaryProviderId: string | null;
  sourceCount: number;
  updatedAt: string;
};

type ProviderRecord = {
  id: string;
  name: string;
  pack: string;
  mode: "FREE" | "CUSTOMER_KEY" | "CUSTOMER_HOSTED";
  costType: string;
  configured: boolean;
  supportedEventTypes: string[];
};

const packLabels: Record<string, string> = {
  weather_disaster: "Weather and disaster",
  maritime_port: "Maritime and port",
  sanctions: "Sanctions",
  osint_news: "OSINT and news",
  cyber_threat: "Cyber threat",
};

function label(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function EventWorkspace() {
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [query, setQuery] = useState("");
  const [pack, setPack] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [eventsResponse, providersResponse] = await Promise.all([
      fetch("/api/platform/events", { cache: "no-store" }),
      fetch("/api/intelligence/providers", { cache: "no-store" }),
    ]);
    const eventsBody = await eventsResponse.json();
    const providersBody = await providersResponse.json();
    if (!eventsResponse.ok)
      throw new Error(
        eventsBody.error ?? "Intelligence events are unavailable.",
      );
    if (!providersResponse.ok)
      throw new Error(
        providersBody.error ?? "Intelligence providers are unavailable.",
      );
    setEvents(eventsBody.events ?? []);
    setProviders(providersBody.providers ?? []);
  }, []);

  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch((error) =>
        setMessage(
          error instanceof Error
            ? error.message
            : "Intelligence is unavailable.",
        ),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    setMessage("");
    try {
      const response = await fetch("/api/intelligence/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceDays: 7 }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error ?? "Unable to refresh intelligence.");
      const failures = (body.diagnostics ?? []).filter(
        (item: { status: string }) => item.status === "error",
      ).length;
      setMessage(
        failures
          ? `Refresh completed with ${failures} provider failure${failures === 1 ? "" : "s"}.`
          : `Refresh completed. ${body.eventsProcessed ?? 0} normalized events processed.`,
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to refresh intelligence.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  const filteredEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      const matchesPack = pack === "all" || event.category === pack;
      const matchesQuery =
        !needle ||
        `${event.title} ${event.summary} ${event.eventType} ${event.primaryProviderId ?? ""}`
          .toLowerCase()
          .includes(needle);
      return matchesPack && matchesQuery;
    });
  }, [events, pack, query]);

  const configuredProviders = providers.filter(
    (provider) => provider.configured,
  ).length;
  const confirmedEvents = events.filter(
    (event) => event.verificationState === "confirmed",
  ).length;
  const privateEvents = events.filter(
    (event) => event.visibility === "organization_private",
  ).length;

  return (
    <main className="ops-page intelligence-workspace">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">Intelligence</p>
            <h1>Provider-fed events</h1>
            <p className="ops-page-header__detail">
              Normalized signals with source attribution and explicit
              verification state.
            </p>
          </div>
          <div className="ops-page-header__actions">
            <Link
              className="ops-button ops-button--secondary"
              href="/operations"
            >
              <Activity size={15} /> Overview
            </Link>
            <button
              className="ops-button ops-button--primary"
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <RefreshCw className={refreshing ? "ops-spin" : ""} size={15} />{" "}
              {refreshing ? "Refreshing" : "Refresh feeds"}
            </button>
          </div>
        </header>

        <section className="ops-kpi-strip" aria-label="Intelligence summary">
          <div className="ops-kpi">
            <p>Events in view</p>
            <strong>{events.length.toLocaleString()}</strong>
          </div>
          <div className="ops-kpi ops-kpi--cyan">
            <p>Providers ready</p>
            <strong>
              {configuredProviders}/{providers.length || 0}
            </strong>
          </div>
          <div className="ops-kpi">
            <p>Confirmed</p>
            <strong>{confirmedEvents.toLocaleString()}</strong>
          </div>
          <div className="ops-kpi ops-kpi--alert">
            <p>Private to this org</p>
            <strong>{privateEvents.toLocaleString()}</strong>
          </div>
        </section>

        {message && (
          <p className="ops-notice" role="status">
            {message}
          </p>
        )}

        <div className="intelligence-workspace__grid">
          <section className="ops-board intelligence-providers">
            <div className="ops-board__header">
              <Database aria-hidden="true" size={17} />
              <div>
                <h2>Provider registry</h2>
                <p>
                  Public feeds and customer-owned connectors are tracked
                  separately.
                </p>
              </div>
            </div>
            <div className="intelligence-providers__list">
              {providers.map((provider) => (
                <div className="intelligence-provider" key={provider.id}>
                  <span
                    className={`intelligence-provider__status ${provider.configured ? "is-ready" : "is-off"}`}
                    aria-label={
                      provider.configured ? "Ready" : "Not configured"
                    }
                  >
                    {provider.configured ? (
                      <CheckCircle2 size={14} />
                    ) : (
                      <CloudOff size={14} />
                    )}
                  </span>
                  <div>
                    <strong>{provider.name}</strong>
                    <small>
                      {packLabels[provider.pack] ?? label(provider.pack)}
                    </small>
                  </div>
                  <span className="intelligence-provider__mode">
                    {provider.mode === "FREE" ? "Public" : "Private"}
                  </span>
                </div>
              ))}
              {!providers.length && !loading && (
                <p className="ops-empty-row">
                  No provider catalog is available.
                </p>
              )}
            </div>
          </section>

          <section className="ops-board intelligence-events">
            <div className="ops-board__header intelligence-events__header">
              <div>
                <h2>Normalized events</h2>
                <p>
                  Newest updates first. Public authority records are shared;
                  customer feeds remain private.
                </p>
              </div>
              <ShieldCheck aria-hidden="true" size={17} />
            </div>
            <div className="intelligence-events__filters">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search events"
                aria-label="Search events"
              />
              <select
                value={pack}
                onChange={(event) => setPack(event.target.value)}
                aria-label="Filter by intelligence pack"
              >
                <option value="all">All packs</option>
                {Object.entries(packLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </div>
            <div className="intelligence-events__table">
              <div className="intelligence-events__table-head">
                <span>Event</span>
                <span>Verification</span>
                <span>Updated</span>
              </div>
              {loading && (
                <p className="ops-empty-row">Loading intelligence events...</p>
              )}
              {!loading &&
                filteredEvents.map((event) => (
                  <article className="intelligence-event-row" key={event.id}>
                    <div className="intelligence-event-row__title">
                      <strong>{event.title}</strong>
                      <small>
                        {label(event.eventType)} ·{" "}
                        {event.primaryProviderId ?? "Manual record"} ·{" "}
                        {event.sourceCount} source
                        {event.sourceCount === 1 ? "" : "s"}
                      </small>
                    </div>
                    <div className="intelligence-event-row__state">
                      <span
                        className={`ops-status is-${event.verificationState}`}
                      >
                        {label(event.verificationState)}
                      </span>
                      {event.confidence !== null && (
                        <small>{event.confidence}% confidence</small>
                      )}
                    </div>
                    <time dateTime={event.updatedAt}>
                      {dateLabel(event.updatedAt)}
                    </time>
                  </article>
                ))}
              {!loading && !filteredEvents.length && (
                <p className="ops-empty-row">
                  No events match the current filter.
                </p>
              )}
            </div>
            <div className="intelligence-events__footer">
              <CircleAlert size={14} /> Provider verification is not analyst
              verification. Correlation arrives in a later workflow.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
