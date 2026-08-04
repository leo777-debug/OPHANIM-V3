"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  FileClock,
  FolderCheck,
  LifeBuoy,
  Map,
  Menu,
  PackageSearch,
  Settings,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import LogisticsTopBar from "./LogisticsTopBar";

const navigation = [
  { href: "/", label: "Command", icon: ShieldAlert, exact: true },
  { href: "/logistics", label: "Shipments", icon: PackageSearch, exact: true },
  { href: "/logistics/rescue", label: "Rescue Cases", icon: LifeBuoy },
  {
    href: "/logistics/waiting-replies",
    label: "Waiting for Replies",
    icon: FileClock,
  },
  { href: "/logistics/disruptions", label: "Disruptions", icon: TriangleAlert },
  { href: "/logistics/map", label: "Map", icon: Map },
  { href: "/logistics/evidence", label: "Evidence", icon: FolderCheck },
  { href: "/logistics/notifications", label: "Notifications", icon: Bell },
  { href: "/logistics/settings", label: "Settings", icon: Settings },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className={`ops-shell${collapsed ? " ops-shell--collapsed" : ""}${mobileOpen ? " ops-shell--mobile-open" : ""}`}
    >
      <aside className="ops-sidebar" aria-label="Logistics navigation">
        <div className="ops-sidebar__brand">
          <span className="ops-sidebar__mark">O</span>
          <span className="ops-sidebar__title">Ophanim</span>
          <button
            type="button"
            className="ops-sidebar__collapse"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? (
              <ChevronRight aria-hidden="true" size={16} />
            ) : (
              <ChevronLeft aria-hidden="true" size={16} />
            )}
          </button>
        </div>
        <nav>
          {navigation.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`ops-sidebar__link${active ? " is-active" : ""}`}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
              >
                <Icon aria-hidden="true" size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="ops-shell__workspace">
        <button
          type="button"
          className="ops-mobile-nav-trigger"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label="Toggle logistics navigation"
        >
          <Menu aria-hidden="true" size={19} />
        </button>
        <LogisticsTopBar />
        <div className="ops-shell__content">{children}</div>
      </div>
    </div>
  );
}
