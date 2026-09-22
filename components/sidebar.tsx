"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/auth-provider";

const primary = [
  { href: "/", label: "Tracking" },
  { href: "/rankings", label: "Rankings" },
  { href: "/matches", label: "Matches" },
  { href: "/standings", label: "Standings" }
];

const reference = [
  { href: "/schools", label: "School names" },
  { href: "/rules", label: "RPI rules" },
  { href: "/sources", label: "Source log" },
  { href: "/method", label: "Method" }
];

export function Sidebar() {
  const pathname = usePathname();
  const { preview, user, signOutUser } = useSession();
  const [open, setOpen] = useState(false);

  const renderLinks = (links: typeof primary) =>
    links.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        className={pathname === item.href ? "nav-link active" : "nav-link"}
        onClick={() => setOpen(false)}
      >
        {item.label}
      </Link>
    ));

  return (
    <aside className={open ? "sidebar open" : "sidebar"}>
      <div className="brand-block">
        <div className="brand-mark">TCS</div>
        <div>
          <p className="sidebar-event">NIVC 2026</p>
          <p className="sidebar-title">RPI Tracker</p>
        </div>
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-expanded={open}
          aria-label="Toggle navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        <p className="nav-section-label">Selection</p>
        {renderLinks(primary)}
        <p className="nav-section-label">Reference</p>
        {renderLinks(reference)}
      </nav>
      <div className="sidebar-footer">
        <p>{preview ? "Workbook preview" : user?.displayName ?? user?.email}</p>
        {preview ? (
          <span className="badge badge-info">Fixture mode</span>
        ) : (
          <button className="btn btn-secondary" onClick={() => void signOutUser()}>
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}
