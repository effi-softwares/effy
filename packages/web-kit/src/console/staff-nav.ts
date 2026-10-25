import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

/**
 * The consoles' sidebar model — back-office and shop-web share it, and `StaffShell` renders it.
 *
 * Groups of entries; an entry may hold sub-pages; a leaf may carry a live count. A hidden item is a
 * courtesy, never the guard: `requiredRole` mirrors the gate the backend checks, and the backend
 * refuses the request whatever the menu shows. Generic over the surface's role union and count keys.
 */
export interface StaffNavLeaf<TRole extends string = string, TCount extends string = string> {
  key: string;
  label: string;
  to: string;
  /** A tab carried in the URL (`/delivery?tab=pricing`). Matched as part of "is this the page". */
  tab?: string;
  /**
   * Other search params that make this page (`/orders?view=queue`). Every one must match for the leaf
   * to be the page, and a leaf that names them beats a plain one on the same path.
   */
  query?: Readonly<Record<string, string>>;
  count?: TCount;
  /** A black count: the queue where something has already gone wrong. */
  countTone?: "strong";
  requiredRole?: TRole;
  /** Shown to any one of these roles. */
  requiredAnyRole?: readonly TRole[];
}

export interface StaffNavEntry<TRole extends string = string, TCount extends string = string>
  extends StaffNavLeaf<TRole, TCount> {
  icon: LucideIcon;
  subs?: readonly StaffNavLeaf<TRole, TCount>[];
}

export interface StaffNavGroup<TRole extends string = string, TCount extends string = string> {
  label: string;
  items: readonly StaffNavEntry<TRole, TCount>[];
}

/** The tab a route opens on when the URL names none — a sub-page for it must count as active. */
export type DefaultTabs = Readonly<Record<string, string>>;

/** The menu this person sees. Role filtering only — the backend is the gate. */
export function visibleStaffGroups<TRole extends string, TCount extends string>(
  groups: readonly StaffNavGroup<TRole, TCount>[],
  roles: readonly TRole[],
): StaffNavGroup<TRole, TCount>[] {
  const allowed = (leaf: StaffNavLeaf<TRole, TCount>) =>
    (leaf.requiredRole === undefined || roles.includes(leaf.requiredRole)) &&
    (leaf.requiredAnyRole === undefined || leaf.requiredAnyRole.some((r) => roles.includes(r)));
  return groups
    .map((g) => ({
      label: g.label,
      items: g.items
        .filter(allowed)
        .map((item) => (item.subs ? { ...item, subs: item.subs.filter(allowed) } : item)),
    }))
    .filter((g) => g.items.length > 0);
}

export interface Where {
  pathname: string;
  tab?: string;
  /** The URL's search params, for leaves that name a `query`. */
  query?: Readonly<Record<string, unknown>>;
}

/**
 * Which leaf is the page on screen. The most specific `to` wins (`/orders/assignments` beats
 * `/orders`), and a leaf that names a tab only matches that tab — so "Pricing" and "Coverage" are
 * never both lit. Derived from the router every render; never held in state.
 */
export function staffActiveKey(
  groups: readonly StaffNavGroup[],
  where: Where,
  defaultTabs: DefaultTabs = {},
): string | null {
  const tab = where.tab ?? defaultTabs[where.pathname];
  let best: { key: string; score: number } | null = null;
  for (const group of groups) {
    for (const item of group.items) {
      for (const leaf of item.subs ?? [item]) {
        const score = matchScore(leaf, where.pathname, tab, defaultTabs, where.query);
        if (score > 0 && (!best || score > best.score)) best = { key: leaf.key, score };
      }
    }
  }
  return best?.key ?? null;
}

function matchScore(
  leaf: StaffNavLeaf,
  pathname: string,
  tab: string | undefined,
  defaultTabs: DefaultTabs,
  query: Readonly<Record<string, unknown>> | undefined,
): number {
  if (leaf.to === "/") return pathname === "/" ? 1 : 0;
  const onPath = pathname === leaf.to || pathname.startsWith(leaf.to + "/");
  if (!onPath) return 0;
  if (leaf.query) {
    // Every named param must match (an order opened from the queue keeps `view=queue`, so Queue stays
    // lit on its detail); one more than a plain leaf on the same path, so the named one wins.
    const keys = Object.keys(leaf.query);
    if (!keys.every((k) => String(query?.[k] ?? "") === leaf.query![k])) return 0;
    return leaf.to.length * 2 + keys.length;
  }
  if (leaf.tab !== undefined) {
    // A record under the page (`/customers/abc`) belongs to the page's default tab — the list it was
    // opened from — not to a settings tab that happens to share the route.
    if (pathname !== leaf.to) return leaf.tab === defaultTabs[leaf.to] ? leaf.to.length * 2 : 0;
    return leaf.tab === tab ? leaf.to.length * 2 + 1 : 0;
  }
  return leaf.to.length * 2;
}

/** Where the active leaf sits: its group, its entry and (for a sub-page) the leaf. For the breadcrumb. */
export function staffLocate<TRole extends string, TCount extends string>(
  groups: readonly StaffNavGroup<TRole, TCount>[],
  key: string | null,
): { group: StaffNavGroup<TRole, TCount>; item: StaffNavEntry<TRole, TCount>; leaf: StaffNavLeaf<TRole, TCount> } | null {
  if (!key) return null;
  for (const group of groups) {
    for (const item of group.items) {
      if (item.key === key) return { group, item, leaf: item };
      const leaf = item.subs?.find((s) => s.key === key);
      if (leaf) return { group, item, leaf };
    }
  }
  return null;
}

/**
 * The link for a leaf: its route, plus its tab when it names one.
 *
 * The nav holds paths as strings (it is data, matched against `location.pathname`), so the router's
 * typed `to` is asserted here, once. Each surface's nav test holds every `to` to a route it declares.
 */
export function staffLinkOf(leaf: StaffNavLeaf): LinkProps {
  const search = { ...(leaf.tab ? { tab: leaf.tab } : {}), ...leaf.query };
  return (Object.keys(search).length > 0 ? { to: leaf.to, search } : { to: leaf.to }) as LinkProps;
}

/**
 * How the shell names the person signed in. The session carries an email, no display name, so its
 * local part stands in ("alex.chen" → "Alex Chen"); it is only shown back to the person it belongs to.
 */
export function displayName(email: string): string {
  const local = email.split("@")[0] ?? "";
  if (!local) return "Signed in";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function initialsOf(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  const letters = parts.length > 1 ? parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0) : name.slice(0, 2);
  return letters.toUpperCase();
}
