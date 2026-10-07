import { Link } from "@tanstack/react-router";

/**
 * Orders · Assignments · Handover (073) — one section for "where is it and who has it".
 *
 * ⚠ LINKS, NOT CLIENT-SIDE TABS. Each tab is its own route, so a dispatcher can bookmark
 * Assignments, the browser's back button does what it says, and the live channel refreshes whichever
 * one is open. The Dispatch page that Assignments replaced redirects here.
 */
const TABS = [
  { to: "/orders", label: "Orders", exact: true },
  { to: "/orders/assignments", label: "Assignments", exact: false },
  { to: "/orders/handover", label: "Handover", exact: false },
] as const;

export function OrdersTabs() {
  return (
    <nav aria-label="Orders" className="flex gap-1 border-b border-border">
      {TABS.map((t) => (
        <Link
          key={t.to}
          to={t.to}
          activeOptions={{ exact: t.exact }}
          className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          activeProps={{ className: "border-primary text-foreground", "aria-current": "page" }}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
