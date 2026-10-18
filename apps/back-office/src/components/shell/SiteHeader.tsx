import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Menu, PanelLeft, RefreshCw, RefreshCcw, Search, WifiOff } from "lucide-react";

import { useSidebar } from "@effy/design-system/ui";
import { useLiveStatus } from "@effy/web-kit/console";

import { Kbd } from "@/components/patterns/Kbd";

import { activeKey, linkOf, locate, type NavGroup } from "./nav";

/**
 * The header (sidebar-07's SiteHeader, board "Header"): 56px — the rail trigger, a hairline, where
 * you are (section › page › record), and on the right the live status and the ⌘K search.
 * Below 768px: a menu button, the page's own title and a search icon.
 */
export function SiteHeader({ groups, onOpenSearch }: { groups: readonly NavGroup[]; onOpenSearch: () => void }) {
  const { pathname, search } = useLocation();
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const detail = useContext(DetailContext)?.detail ?? null;
  const tab = typeof (search as { tab?: unknown }).tab === "string" ? (search as { tab: string }).tab : undefined;
  const where = locate(groups, activeKey(groups, { pathname, tab }));

  // "Operations › Overview", or for a grouped page "Orders › All orders"; a record adds itself after
  // the page, which then links back to its list ("Orders › All orders › EFY-20481").
  const section = where ? (where.item.subs ? where.item.label : where.group.label) : null;
  const page = where ? (where.item.subs ? where.leaf.label : where.item.label) : null;
  const mobileTitle = detail ?? page ?? "Effy Back-Office";

  return (
    <header className="bo-topbar">
      <button type="button" className="bo-iconbtn md:hidden" aria-label="Open menu" onClick={() => setOpenMobile(true)}>
        <Menu aria-hidden="true" />
      </button>
      <button
        type="button"
        className="bo-iconbtn max-md:hidden"
        aria-label="Toggle sidebar"
        title="Toggle sidebar (⌘B)"
        onClick={toggleSidebar}
      >
        <PanelLeft aria-hidden="true" />
      </button>
      <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border max-md:hidden" />

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 overflow-hidden text-sm whitespace-nowrap text-muted-foreground max-md:hidden">
        {where && section && page ? (
          <>
            <span>{section}</span>
            <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
            {detail ? (
              <>
                <Link {...linkOf(where.leaf)} className="hover:text-foreground">
                  {page}
                </Link>
                <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
                <span aria-current="page" className="truncate font-medium text-foreground">
                  {detail}
                </span>
              </>
            ) : (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {page}
              </span>
            )}
          </>
        ) : (
          <span aria-current="page" className="font-medium text-foreground">
            Effy Back-Office
          </span>
        )}
      </nav>
      <span className="truncate text-[15px] font-semibold md:hidden">{mobileTitle}</span>

      <div className="ml-auto flex items-center gap-1">
        <LivePill />
        <button type="button" className="bo-topbar-search max-md:hidden" aria-label="Search orders, customers and codes" onClick={onOpenSearch}>
          <Search aria-hidden="true" />
          <span className="truncate">Order, customer, package…</span>
          <Kbd className="ml-auto">⌘K</Kbd>
        </button>
        <button type="button" className="bo-iconbtn md:hidden" aria-label="Search" onClick={onOpenSearch}>
          <Search aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

const APPEAR_AFTER_MS = 4_000;
const clock = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Melbourne" });

/**
 * 071 — says so when the screen cannot receive live updates, and how old what is on it is.
 *
 * Nothing while the channel is live: an always-on "Live" badge is one more thing that can be green
 * while the screen is wrong. It waits a few seconds before appearing — every load and every brief
 * blip passes through "reconnecting", and flashing a warning for each teaches people to ignore it.
 */
function LivePill() {
  const live = useLiveStatus();
  const state = live?.state ?? "live";
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (state === "live") {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), APPEAR_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state]);

  if (!live || state === "live" || !shown) return null;
  const reconnecting = state === "reconnecting";
  const at = clock.format(live.currentAsOf).replace(/[\u00a0\u202f]/g, " ").toLowerCase();
  return (
    <>
      <span role="status" className="bo-live">
        {reconnecting ? <RefreshCcw aria-hidden="true" /> : <WifiOff aria-hidden="true" />}
        {reconnecting ? "Reconnecting" : "Live updates off"} · last updated {at}
      </span>
      <button type="button" className="bo-iconbtn" aria-label="Refresh now" onClick={live.refresh}>
        <RefreshCw aria-hidden="true" />
      </button>
    </>
  );
}

/* ---------- The record a page is showing, for the breadcrumb's last crumb ---------- */

const DetailContext = createContext<{ detail: string | null; setDetail: (d: string | null) => void } | null>(null);

export function HeaderDetailProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<string | null>(null);
  return <DetailContext.Provider value={{ detail, setDetail }}>{children}</DetailContext.Provider>;
}

/**
 * A record page names itself in the header ("EFY-20481"). Cleared when the page unmounts, so a
 * stale name never follows the person to the next page.
 */
export function useHeaderDetail(label: string | null | undefined): void {
  const ctx = useContext(DetailContext);
  const setDetail = ctx?.setDetail;
  useEffect(() => {
    if (!setDetail) return;
    setDetail(label ?? null);
    return () => setDetail(null);
  }, [label, setDetail]);
}
