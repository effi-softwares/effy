// A person's notification inbox (110): what the inbox routes send and the categories a person can filter by.
//
// The routes are the same five for each audience (specs/110-notification-inboxes/contracts/inbox-api.md). Category
// labels and icons are pinned to `notification-inbox.fixtures.json`; the customer and driver apps embed a copy, and
// notification-inbox.test.ts fails a copy that drifts.

import type { NotificationAudience } from "./notification-destinations";
import { OPERATING_TZ } from "./operating-zone";

export type InboxFilter = "all" | "unread";

/** Every category a notification can carry (the DB CHECK's list). */
export type InboxCategory =
  | "orders"
  | "points"
  | "work"
  | "stock"
  | "products"
  | "offers"
  | "news"
  | "important"
  | "support"
  | "announcements";

export interface InboxCategoryInfo {
  /** The words on a filter chip and beside an icon. */
  label: string;
  /** A Lucide icon name; each surface draws its own. */
  icon: string;
  /** Audiences whose inbox offers this category as a filter. */
  filterableBy: readonly NotificationAudience[];
}

export const INBOX_CATEGORIES: { readonly [C in InboxCategory]: InboxCategoryInfo } = {
  orders: { label: "Orders", icon: "package", filterableBy: ["customer", "shop"] },
  points: { label: "Points", icon: "coins", filterableBy: ["customer"] },
  work: { label: "Work", icon: "truck", filterableBy: [] },
  stock: { label: "Stock", icon: "boxes", filterableBy: ["shop"] },
  products: { label: "Products", icon: "shopping-basket", filterableBy: ["shop"] },
  offers: { label: "Offers", icon: "tag", filterableBy: ["customer"] },
  news: { label: "News", icon: "newspaper", filterableBy: ["customer"] },
  important: { label: "Important", icon: "circle-alert", filterableBy: ["customer", "shop"] },
  support: { label: "Support", icon: "message-circle", filterableBy: ["customer"] },
  announcements: { label: "Announcements", icon: "megaphone", filterableBy: ["shop"] },
};

/** The categories an audience may filter by, in display order. The driver inbox has none. */
export function inboxCategoriesFor(audience: NotificationAudience): InboxCategory[] {
  return (Object.keys(INBOX_CATEGORIES) as InboxCategory[]).filter((c) =>
    INBOX_CATEGORIES[c].filterableBy.includes(audience),
  );
}

export function isInboxCategory(value: unknown): value is InboxCategory {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(INBOX_CATEGORIES, value);
}

/** One notification in a list. */
export interface InboxItemDTO {
  id: string;
  type: string;
  category: string;
  importance: "normal" | "important";
  title: string;
  body: string;
  /** As stored (109's vocabulary); parse it with the same lenient parser as a push. */
  destination: { [field: string]: string };
  /** ISO 8601. */
  createdAt: string;
  readAt: string | null;
  pinnedUntil: string | null;
  /** "Ends Sun", only for offers, news, announcements and important items with an end; otherwise null. */
  endsLabel: string | null;
  /** A message's picture (112), at Effy's public picture address; null for everything else. */
  imageUrl: string | null;
}

/** `GET /{audience}/v1/notifications`. */
export interface InboxPageDTO {
  /** Important unread items still pinned; first page only, otherwise empty. Never repeated in `items`. */
  pinned: InboxItemDTO[];
  /** Newest first. */
  items: InboxItemDTO[];
  /** null at the end. */
  nextCursor: string | null;
  /** First page only: the categories that have listed items. null on later pages. */
  categories: string[] | null;
  unseenCount: number;
}

/** `GET …/unseen-count` and `POST …/seen`. */
export interface InboxCountDTO {
  unseenCount: number;
}

/** `POST …/seen` and `POST …/read-all`: the createdAt of the newest item the person was shown. */
export interface InboxCutoffRequest {
  before: string;
}

/** `POST …/read-all`. */
export interface InboxReadAllDTO {
  updated: number;
  unseenCount: number;
}

/** `PATCH …/{id}`. */
export interface InboxArchiveRequest {
  archived: boolean;
}

export interface InboxArchiveDTO {
  id: string;
  archived: boolean;
}

// ---- Today / Yesterday / Earlier on Effy's clock (110 R21), for the two web inboxes ----

export type InboxDayHeading = "Today" | "Yesterday" | "Earlier";

export interface InboxDayGroup<T> {
  heading: InboxDayHeading;
  items: T[];
}

const effyDay = (ms: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ms));

/** Items (newest first) under Today, Yesterday and Earlier, by the day on Effy's clock. Empty groups are left out. */
export function groupInboxByDay<T extends { createdAt: string }>(items: readonly T[], now: Date = new Date(), tz: string = OPERATING_TZ): InboxDayGroup<T>[] {
  const today = effyDay(now.getTime(), tz);
  const yesterday = effyDay(now.getTime() - 86_400_000, tz);
  const groups: Record<InboxDayHeading, T[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of items) {
    const day = effyDay(Date.parse(item.createdAt), tz);
    groups[day === today ? "Today" : day === yesterday ? "Yesterday" : "Earlier"].push(item);
  }
  return (["Today", "Yesterday", "Earlier"] as const).filter((h) => groups[h].length > 0).map((heading) => ({ heading, items: groups[heading] }));
}

/** "9:12 am" today and yesterday, "Fri 6 Nov" before that - on Effy's clock. */
export function inboxTimeLabel(createdAt: string, now: Date = new Date(), tz: string = OPERATING_TZ): string {
  const at = Date.parse(createdAt);
  if (Number.isNaN(at)) return "";
  const days = Math.round((Date.parse(effyDay(now.getTime(), tz)) - Date.parse(effyDay(at, tz))) / 86_400_000);
  if (days <= 1) {
    return new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
      .format(at)
      .replace(/\s?([ap])\.?m\.?/i, " $1m")
      .toLowerCase();
  }
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/**
 * What arrived since the person last looked (feature 120 R8): the toast that says a notification came in, in the shop
 * console and on the website. From the inbox's first page: items newer than `since`, unread, not of an excluded type
 * and not about the page the person is on. `since` null means "first look": nothing is new, only the mark is set.
 */
export function inboxArrivals<T extends { type: string; createdAt: string; readAt: string | null }>(
  page: { pinned: readonly T[]; items: readonly T[] },
  since: string | null,
  options: { exclude?: readonly string[]; isHere?: (item: T) => boolean } = {},
): { arrived: T[]; newest: string | null } {
  const all = [...page.pinned, ...page.items];
  const newest = all.reduce<string | null>((n, i) => (n === null || Date.parse(i.createdAt) > Date.parse(n) ? i.createdAt : n), since);
  if (since === null) return { arrived: [], newest };
  const after = Date.parse(since);
  const exclude = new Set(options.exclude ?? []);
  const arrived = all
    .filter((i) => Date.parse(i.createdAt) > after && i.readAt === null && !exclude.has(i.type) && !(options.isHere?.(i) ?? false))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { arrived, newest };
}

/** The words of an arrival toast: one item says its own title; several say how many. */
export function inboxArrivalTitle(arrived: readonly { title: string }[]): string {
  return arrived.length === 1 ? arrived[0]!.title : `${arrived.length} new notifications`;
}
