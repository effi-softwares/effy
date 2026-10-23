import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter, type LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { BadgePercent, Car, Coins, MapPinned, Package, ScanLine, Search, Store, UserPlus, UserRound } from "lucide-react";

import { readCode, type BackOfficeRole } from "@effy/shared-types";
import { cn } from "@effy/design-system";
import { useIsMobile } from "@effy/design-system/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  toast,
} from "@effy/design-system/ui";

import { Kbd } from "@/components/patterns/Kbd";
import { customerSearchQuery } from "@/features/customers/queries";
import { ordersListQuery } from "@/features/orders/queries";
import { lookupLabel } from "@/features/orders/repo";

import { CHORDS } from "./chords";
import { linkOf, type NavGroup } from "./nav";
import { lookupLink } from "./ScanBox";

/**
 * Search and commands (board "Command palette (⌘K)"): orders, customers and package codes, the
 * actions this person may take, and every page — one list, keyboard first.
 *
 * Dialog from 768px; below it the same content rises as a drawer. Actions a role cannot take are
 * not listed at all (the line in the footer says so) — and the page each opens still enforces it.
 */
export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly NavGroup[];
  roles: readonly BackOfficeRole[];
}

interface Item {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Codes and references read in Geist Mono. */
  mono?: boolean;
  meta?: string;
  hint?: string;
  keys?: string;
  link: LinkProps;
  /** A record worth remembering under "Recent". */
  recent?: RecentEntry;
  /** An item that looks something up before it knows where to go (a bag code). */
  run?: () => Promise<void>;
}

interface Section {
  label: string;
  items: Item[];
}

interface RecentEntry {
  id: string;
  kind: "order" | "customer";
  label: string;
  meta: string;
  ref: string;
}

/**
 * The actions, each opening the page where it is done. `roles` mirrors the gate that page applies
 * (and that the backend enforces) — a csa does not see "Add a driver" offered and then refused.
 */
const ACTIONS: readonly { id: string; label: string; icon: LucideIcon; to: string; tab?: string; roles: readonly BackOfficeRole[] }[] = [
  { id: "credit", label: "Credit points to a customer…", icon: Coins, to: "/customers", roles: ["admin", "manager", "csa"] },
  { id: "add-driver", label: "Add a driver", icon: UserPlus, to: "/drivers", roles: ["admin", "manager"] },
  { id: "add-vehicle", label: "Add a vehicle", icon: Car, to: "/vehicles", roles: ["admin", "manager"] },
  { id: "add-code", label: "Create a promotion code", icon: BadgePercent, to: "/promotions/new", roles: ["admin", "manager"] },
  { id: "add-places", label: "Add places Effy delivers to", icon: MapPinned, to: "/delivery", tab: "coverage", roles: ["admin", "manager"] },
];

const money = (amount: string, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(Number(amount));

const RECENT_KEY = "effy.palette.recent";

function readRecent(): RecentEntry[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentEntry[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

/** A per-viewer convenience only: lost in a private window, never shared, never read by anyone else. */
function rememberRecent(entry: RecentEntry): void {
  try {
    const next = [entry, ...readRecent().filter((r) => r.id !== entry.id)].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — the palette works without it */
  }
}

function recentLink(r: RecentEntry): LinkProps {
  return (r.kind === "order"
    ? { to: "/orders/$orderId", params: { orderId: r.ref } }
    : { to: "/customers/$customerId", params: { customerId: r.ref } }) as LinkProps;
}

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ open, onOpenChange, groups, roles }: CommandPaletteProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState(0);
  const q = useDebounced(query.trim(), 200);
  const searching = q.length >= 3;
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setFocus(0);
    }
  }, [open]);

  const orders = useQuery({ ...ordersListQuery({ q }), enabled: open && searching, placeholderData: keepPreviousData });
  const customers = useQuery({ ...customerSearchQuery(q), enabled: open && searching });

  const sections = useMemo<Section[]>(() => {
    const text = query.trim().toLowerCase();
    const matches = (s: string) => !text || s.toLowerCase().includes(text);
    const out: Section[] = [];

    // A bag's code (bag 2 onwards has no order-search match): look it up, then open its order.
    const bagCode = readCode(query, "typed");
    // Many words ("search", "drafts") are also the shape of a code: unless it has a digit or the
    // label's prefix, the bag item goes last so Enter still picks the page or command.
    const bagFirst = bagCode !== null && (/\d/.test(query) || /^\s*efy1:/i.test(query));
    const bagSection: Section[] = [];
    if (bagCode) {
      bagSection.push({
        label: "Bag label",
        items: [{
          id: `bag:${bagCode}`,
          icon: ScanLine,
          label: `${bagCode.slice(0, 3)} ${bagCode.slice(3)}`,
          mono: true,
          meta: "· Open the bag's order",
          link: { to: "/orders" } as LinkProps,
          run: async () => {
            const found = await lookupLabel(query, "typed").catch(() => undefined);
            if (found === undefined) return void toast.error("Couldn't look that code up. Try again.");
            if (!found) return void toast.error("No bag has that code.");
            void navigate(lookupLink(found) as never);
          },
        }],
      });
    }

    if (bagFirst) out.push(...bagSection);

    if (searching) {
      const orderItems = (orders.data?.items ?? []).slice(0, 5).map<Item>((o) => ({
        id: `order:${o.id}`,
        icon: Package,
        label: o.orderNumber,
        mono: true,
        meta: `· ${o.customerEmail}${o.statusView ? ` · ${o.statusView.word}` : ""}`,
        hint: money(o.grandTotalAmount, o.currency),
        link: { to: "/orders/$orderId", params: { orderId: o.id } } as LinkProps,
        recent: { id: `order:${o.id}`, kind: "order", label: o.orderNumber, meta: "· Order", ref: o.id },
      }));
      if (orderItems.length) out.push({ label: "Orders", items: orderItems });

      const customerItems = (customers.data ?? []).slice(0, 5).map<Item>((c) => ({
        id: `customer:${c.id}`,
        icon: UserRound,
        label: c.name || c.email,
        meta: c.name ? `· ${c.email}` : undefined,
        link: { to: "/customers/$customerId", params: { customerId: c.id } } as LinkProps,
        recent: { id: `customer:${c.id}`, kind: "customer", label: c.name || c.email, meta: "· Customer", ref: c.id },
      }));
      if (customerItems.length) out.push({ label: "Customers", items: customerItems });
    }

    const actions = ACTIONS.filter((a) => a.roles.some((r) => roles.includes(r)) && matches(a.label)).map<Item>((a) => ({
      id: `action:${a.id}`,
      icon: a.icon,
      label: a.label,
      link: linkOf({ key: a.id, label: a.label, to: a.to, tab: a.tab }),
    }));
    if (actions.length) out.push({ label: "Actions", items: actions });

    const pages: Item[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        for (const leaf of item.subs ?? [item]) {
          const label = item.subs && leaf.label !== item.label ? `${item.label} › ${leaf.label}` : leaf.label;
          if (!matches(label)) continue;
          pages.push({
            id: `page:${leaf.key}`,
            icon: item.icon,
            label,
            keys: CHORDS.find((c) => c.navKey === leaf.key)?.label,
            link: linkOf(leaf),
          });
        }
      }
    }
    if (pages.length) out.push({ label: "Go to", items: text ? pages : pages.filter((p) => p.keys) });

    if (!text) {
      const recent = readRecent().map<Item>((r) => ({
        id: `recent:${r.id}`,
        icon: r.kind === "order" ? Package : r.kind === "customer" ? UserRound : Store,
        label: r.label,
        mono: r.kind === "order",
        meta: r.meta,
        link: recentLink(r),
      }));
      if (recent.length) out.push({ label: "Recent", items: recent });
    }
    if (!bagFirst) out.push(...bagSection);
    return out.filter((s) => s.items.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- readRecent is read when the palette re-renders
  }, [query, searching, orders.data, customers.data, groups, roles, open]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => {
    setFocus(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${focus}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  function choose(item: Item, newTab: boolean) {
    if (item.run) {
      onOpenChange(false);
      void item.run();
      return;
    }
    if (item.recent) rememberRecent(item.recent);
    if (newTab) {
      window.open(router.buildLocation(item.link as never).href, "_blank", "noopener");
      return;
    }
    onOpenChange(false);
    void navigate(item.link as never);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocus((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocus((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const item = flat[focus];
      if (!item) return;
      e.preventDefault();
      choose(item, e.metaKey || e.ctrlKey);
    }
  }

  const loading = searching && (orders.isFetching || customers.isFetching);
  let index = -1;

  const body: ReactNode = (
    <>
      <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
        <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded="true"
          aria-controls="bo-palette-list"
          aria-activedescendant={flat[focus] ? `bo-palette-${focus}` : undefined}
          aria-label="Search"
          placeholder="Search orders, customers, packages, codes — or type a command"
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <Kbd className="max-md:hidden">esc</Kbd>
      </div>
      <div ref={listRef} id="bo-palette-list" role="listbox" aria-label="Results" className="max-h-[440px] overflow-y-auto px-2 pt-1 pb-2 max-md:max-h-none max-md:flex-1">
        {sections.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            {loading ? "Searching…" : searching ? "Nothing matches that." : "Type three characters to search orders and customers."}
          </p>
        ) : (
          sections.map((section) => (
            <div key={section.label} role="group" aria-label={section.label} className="pt-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{section.label}</div>
              {section.items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <button
                    key={item.id}
                    id={`bo-palette-${i}`}
                    type="button"
                    role="option"
                    aria-selected={i === focus}
                    data-index={i}
                    onMouseMove={() => setFocus(i)}
                    onClick={(e) => choose(item, e.metaKey || e.ctrlKey)}
                    className={cn(
                      "flex h-9 w-full items-center gap-2.5 rounded-sm px-2 text-left text-sm",
                      i === focus && "bg-accent",
                    )}
                  >
                    <item.icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className={cn(item.mono && "font-mono text-[13px] tracking-[-0.01em]")}>{item.label}</span>
                      {item.meta ? <span className="text-muted-foreground"> {item.meta}</span> : null}
                    </span>
                    {item.keys ? <Kbd>{item.keys}</Kbd> : null}
                    {item.hint ? <span className="ml-auto text-xs text-muted-foreground tabular-nums">{item.hint}</span> : null}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
      <div className="flex h-10 shrink-0 items-center gap-4 border-t border-border px-4 text-xs whitespace-nowrap text-muted-foreground max-md:hidden">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="flex items-center gap-1">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd> open in a new tab
        </span>
        <span className="ml-auto min-w-0 truncate">Actions you can't take for your role aren't listed.</span>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[92vh] max-h-[92vh] overflow-hidden">
          <DrawerTitle className="sr-only">Search and commands</DrawerTitle>
          <DrawerDescription className="sr-only">Search orders, customers and package codes, or go to a page.</DrawerDescription>
          <span aria-hidden="true" className="mx-auto mt-2.5 mb-1 h-[5px] w-12 shrink-0 rounded-full bg-muted" />
          <div className="flex min-h-0 flex-1 flex-col">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[12%] flex max-w-[640px] translate-y-0 flex-col gap-0! overflow-hidden p-0! sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <DialogDescription className="sr-only">Search orders, customers and package codes, or go to a page.</DialogDescription>
        {body}
      </DialogContent>
    </Dialog>
  );
}
