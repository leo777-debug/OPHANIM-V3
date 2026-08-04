"use client";

import { useEffect, useState } from "react";
import { Bell, Building2, ChevronDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import OperationalSearch from "./OperationalSearch";

type Actor = { organizationId: string; role: string };
type ProviderState = { available: number; total: number };

export default function LogisticsTopBar() {
  const router = useRouter();
  const [actor, setActor] = useState<Actor | null>(null);
  const [providers, setProviders] = useState<ProviderState | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/auth/me", { cache: "no-store" }).then((response) =>
        response.ok ? response.json() : null,
      ),
      fetch("/api/providers", { cache: "no-store" }).then((response) =>
        response.ok ? response.json() : null,
      ),
    ])
      .then(([auth, providerState]) => {
        if (!active) return;
        setActor(auth?.actor ?? null);
        setProviders(
          providerState
            ? { available: providerState.available, total: providerState.total }
            : null,
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
    router.refresh();
  };

  const organization = actor?.organizationId
    ? `Organization ${actor.organizationId.slice(0, 8)}`
    : "Ophanim Logistics";
  const health = providers
    ? `${providers.available}/${providers.total} sources available`
    : "Checking data health";

  return (
    <header className="ops-topbar">
      <div className="ops-topbar__organization">
        <Building2 aria-hidden="true" size={17} />
        <span>{organization}</span>
      </div>
      <OperationalSearch />
      <div className="ops-topbar__actions">
        <span
          className={`ops-health${providers && providers.available < providers.total ? " ops-health--attention" : ""}`}
        >
          <i aria-hidden="true" />
          {health}
        </span>
        <button
          type="button"
          className="ops-icon-button"
          aria-label="Open notifications"
          onClick={() => router.push("/logistics/notifications")}
        >
          <Bell aria-hidden="true" size={17} />
        </button>
        <div className="ops-user-menu">
          <button
            type="button"
            className="ops-user-menu__trigger"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          >
            <span>{actor?.role?.replaceAll("_", " ") ?? "User"}</span>
            <ChevronDown aria-hidden="true" size={15} />
          </button>
          {menuOpen && (
            <div className="ops-user-menu__content">
              <button type="button" onClick={() => void logout()}>
                <LogOut aria-hidden="true" size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
