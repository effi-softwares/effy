import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { Link, useLocation } from "@tanstack/react-router";
import { ChevronRight, Menu, PanelLeft, RefreshCcw, RefreshCw, Search, WifiOff } from "lucide-react";

import { useSidebar } from "@effy/design-system/ui";

import { useLiveStatus } from "../live/LiveProvider";
import { Kbd } from "../patterns/Kbd";
import { staffActiveKey, staffLinkOf, staffLocate, type DefaultTabs, type StaffNavGroup } from "./staff-nav";

/**
 * The consoles' header (sidebar-07's SiteHeader, board "Header"): the rail trigger, a hairline, where
 * you are (section › page › record), then the surface's own controls, the live status and the ⌘K
 * search. Below 768px: a menu button, the page's own title and a search icon.
 */
export interface StaffHeaderProps {
  title: string;
  groups: readonly StaffNavGroup[];
  defaultTabs?: DefaultTabs;
  onOpenSearch: () => void;
  /** The search box's prompt, e.g. "Order, customer, package…". */
  searchPrompt: string;
  /** The surface's own controls, placed before the live status and search. */
  actions?: ReactNode;
  /** The account menu (StaffUserMenu), in the right corner after search. */
  account?: ReactNode;
  /** The record on screen, when the surface derives it itself (otherwise `useHeaderDetail`). */
  detail?: string | null;
}

export function StaffHeader({ title, groups, defaultTabs, onOpenSearch, searchPrompt, actions, account, detail: detailProp }: StaffHeaderProps) {
  const { pathname, search } = useLocation();
  const { toggleSidebar, setOpenMobile } = useSidebar();
  const fromPage = useContext(DetailContext)?.detail ?? null;
  const detail = detailProp ?? fromPage;
  const tab = typeof (search as { tab?: unknown }).tab === "string" ? (search as { tab: string }).tab : undefined;
  const where = staffLocate(groups, staffActiveKey(groups, { pathname, tab, query: search as Record<string, unknown> }, defaultTabs));

  // "Operations › Overview", or for a grouped page "Orders › All orders"; a record adds itself after
  // the page, which then links back to its list ("Orders › All orders › EFY-20481").
  const section = where ? (where.item.subs ? where.item.label : where.group.label) : null;
  const page = where ? (where.item.subs ? where.leaf.label : where.item.label) : null;
  const mobileTitle = detail ?? page ?? title;

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
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border max-md:hidden" />

      <nav aria-label="Breadcrumb" className="bo-crumbs max-md:hidden">
        {where && section && page ? (
          <>
            <span>{section}</span>
            <ChevronRight aria-hidden="true" />
            {detail ? (
              <>
                <Link {...staffLinkOf(where.leaf)} className="hover:text-foreground">
                  {page}
                </Link>
                <ChevronRight aria-hidden="true" />
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
            {title}
          </span>
        )}
      </nav>
      <span className="bo-topbar-title truncate md:hidden">{mobileTitle}</span>

      <div className="ml-auto flex items-center gap-2">
        {actions}
        <LivePill />
        <button type="button" className="bo-topbar-search max-lg:hidden" aria-label="Search and commands" onClick={onOpenSearch}>
          <Search aria-hidden="true" />
          <span className="truncate">{searchPrompt}</span>
          <Kbd className="ml-auto">⌘K</Kbd>
        </button>
        <button type="button" className="bo-iconbtn lg:hidden" aria-label="Search" onClick={onOpenSearch}>
          <Search aria-hidden="true" />
        </button>
        {account}
      </div>
    </header>
  );
}

const APPEAR_AFTER_MS = 4_000;
const clock = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Melbourne" });

/**
 * Says so when the screen cannot receive live updates, and how old what is on it is.
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
  const at = clock.format(live.currentAsOf).replace(/[  ]/g, " ").toLowerCase();
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
