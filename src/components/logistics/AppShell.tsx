"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  FolderCheck,
  LifeBuoy,
  Map,
  Menu,
  PackageSearch,
  Settings,
  SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import LogisticsTopBar from "./LogisticsTopBar";

const navigation = [
  {
    label: "Workspace",
    items: [
      {
        href: "/operations",
        label: "Overview",
        icon: ClipboardList,
        exact: true,
      },
      {
        href: "/logistics",
        label: "Shipments",
        icon: PackageSearch,
        exact: true,
      },
      { href: "/events", label: "Intelligence", icon: Boxes },
      { href: "/cases", label: "Investigations", icon: FolderCheck },
    ],
  },
  {
    label: "Company data",
    items: [
      { href: "/imports", label: "Imports", icon: Database },
      { href: "/evidence", label: "Evidence", icon: FolderCheck },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/logistics/map", label: "Operational map", icon: Map },
      { href: "/logistics/rescue", label: "Rescue cases", icon: LifeBuoy },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/logistics/notifications", label: "Alerts", icon: Bell },
      { href: "/logistics/settings", label: "Settings", icon: Settings },
    ],
  },
];

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className={`ops-shell${collapsed ? " ops-shell--collapsed" : ""}${mobileOpen ? " ops-shell--mobile-open" : ""}`}
    >
      <aside className="ops-sidebar" aria-label="Ophanim navigation">
        <div className="ops-sidebar__brand">
          <span className="ops-sidebar__mark" aria-hidden="true">
            O
          </span>
          <span className="ops-sidebar__identity">
            <strong>Ophanim</strong>
            <small>Operations intelligence</small>
          </span>
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
          {navigation.map((group) => (
            <div className="ops-sidebar__group" key={group.label}>
              <p>{group.label}</p>
              {group.items.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`ops-sidebar__link${active ? " is-active" : ""}`}
                    onClick={() => setMobileOpen(false)}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon aria-hidden="true" size={17} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="ops-sidebar__footer">
          <SlidersHorizontal aria-hidden="true" size={15} />
          <span>Evidence-first monitoring</span>
        </div>
      </aside>
      <div className="ops-shell__workspace">
        <button
          type="button"
          className="ops-mobile-nav-trigger"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label="Toggle navigation"
        >
          <Menu aria-hidden="true" size={19} />
        </button>
        <LogisticsTopBar />
        <div className="ops-shell__content">{children}</div>
      </div>
    </div>
  );
}
