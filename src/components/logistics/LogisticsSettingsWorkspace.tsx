"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Save, TriangleAlert } from "lucide-react";
import { requestJson } from "@/lib/logistics/client";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";

type Settings = {
  email: string;
  enabled: boolean;
  mode: "immediate" | "digest";
  digestMinutes: 30 | 60;
  minimumConfidence: number;
  nextDigestAt?: string;
};
type Provider = {
  name: string;
  enabled: boolean;
  configured: boolean;
  health: { status: string };
  requiresCredentials: boolean;
};

export default function LogisticsSettingsWorkspace() {
  const [settings, setSettings] = useState<Settings>({
    email: "",
    enabled: false,
    mode: "immediate",
    digestMinutes: 30,
    minimumConfidence: 55,
  });
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingData, providerData] = await Promise.all([
        requestJson<{ settings: Settings }>("/api/intelligence/settings"),
        requestJson<{ providers: Provider[] }>("/api/providers"),
      ]);
      setSettings(settingData.settings);
      setProviders(providerData.providers);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load logistics settings.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await requestJson<{ settings: Settings }>(
        "/api/intelligence/settings",
        { method: "PUT", body: JSON.stringify(settings) },
      );
      setSettings(data.settings);
      setMessage("Notification settings saved.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to save notification settings.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <main className="ops-page">
      <div className="ops-page__inner">
        <header className="ops-page-header">
          <div>
            <p className="ops-page-header__eyebrow">Operational preferences</p>
            <h1>Settings</h1>
            <p className="ops-page-header__detail">
              Email delivery uses the existing organization-scoped notification
              settings and provider health is read-only.
            </p>
          </div>
        </header>
        {error && (
          <section className="ops-section">
            <ErrorState message={error} onRetry={() => void load()} />
          </section>
        )}
        <section className="ops-section ops-settings-grid">
          <section className="ops-panel ops-detail-panel">
            <h2>Email notifications</h2>
            {loading ? (
              <EmptyState
                title="Loading notification settings"
                detail="Retrieving existing email-delivery preferences."
              />
            ) : (
              <div className="ops-form-stack">
                <label>
                  Delivery email
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        email: event.target.value,
                      }))
                    }
                    placeholder="alerts@example.com"
                  />
                </label>
                <label className="ops-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.enabled}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                  Enable operational delivery
                </label>
                <label>
                  Delivery mode
                  <select
                    value={settings.mode}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        mode: event.target.value as Settings["mode"],
                      }))
                    }
                  >
                    <option value="immediate">Immediate alerts</option>
                    <option value="digest">Scheduled digest</option>
                  </select>
                </label>
                {settings.mode === "digest" && (
                  <label>
                    Digest interval
                    <select
                      value={settings.digestMinutes}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          digestMinutes: Number(event.target.value) as 30 | 60,
                        }))
                      }
                    >
                      <option value={30}>30 minutes</option>
                      <option value={60}>60 minutes</option>
                    </select>
                  </label>
                )}
                <label>
                  Minimum confidence
                  <select
                    value={settings.minimumConfidence}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        minimumConfidence: Number(event.target.value),
                      }))
                    }
                  >
                    <option value={30}>Low (30+)</option>
                    <option value={55}>Medium (55+)</option>
                    <option value={75}>High (75+)</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="ops-button ops-button--primary"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  <Save aria-hidden="true" size={15} />
                  {saving ? "Saving" : "Save settings"}
                </button>
                {message && (
                  <p className="ops-success">
                    <CheckCircle2 aria-hidden="true" size={15} />
                    {message}
                  </p>
                )}
              </div>
            )}
          </section>
          <section className="ops-panel ops-detail-panel">
            <h2>Provider data health</h2>
            {loading ? (
              <EmptyState
                title="Checking providers"
                detail="Retrieving configured provider health."
              />
            ) : providers.length === 0 ? (
              <EmptyState
                title="No providers reported"
                detail="Provider health is temporarily unavailable."
              />
            ) : (
              <div className="ops-provider-list">
                {providers.map((provider) => (
                  <div key={provider.name}>
                    <span
                      className={`ops-provider-list__indicator ops-provider-list__indicator--${provider.health.status}`}
                    />
                    <strong>{provider.name}</strong>
                    <small>
                      {provider.enabled
                        ? provider.configured
                          ? provider.health.status.replaceAll("_", " ")
                          : "configuration required"
                        : "disabled"}
                      {provider.requiresCredentials
                        ? " · credentials required"
                        : ""}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </section>
          <section className="ops-panel ops-detail-panel">
            <h2>Unavailable settings</h2>
            <p className="ops-muted">
              <TriangleAlert aria-hidden="true" size={15} />
              Organization profile, member management, owner assignment, and
              permission editing do not have existing frontend-compatible
              endpoints. They are intentionally not simulated here.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
