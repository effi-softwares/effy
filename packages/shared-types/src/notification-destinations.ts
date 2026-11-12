// Where a notification leads (109): one closed list per audience.
//
// The same JSON is stored in `notification.destination`, sent in a push as a compact string (`data.destination`) and
// returned by the read route. Kotlin twins: the customer and driver apps' `core/push/Destination.kt`, both pinned to
// `notification-destinations.fixtures.json` (notification-destinations.test.ts fails a copy that drifts).
//
// Parsing is lenient on purpose: anything this version does not know - another audience's kind, a missing field,
// non-JSON - is `null`, and an app opens its home screen for `null`. A tap never crashes and never errors.

export type NotificationAudience = "customer" | "driver" | "shop";

export type CustomerDestination =
  | { kind: "home" }
  | { kind: "orders" }
  | { kind: "order"; orderId: string }
  | { kind: "points" }
  | { kind: "product"; productId: string; aisleKey?: string }
  | { kind: "aisle"; aisleKey: string; title?: string }
  | { kind: "search"; query?: string }
  | { kind: "sale" };

export type DriverDestination =
  | { kind: "today" }
  | { kind: "run"; runId: string }
  | { kind: "account" };

export type ShopDestination =
  | { kind: "queue"; fulfillmentId?: string }
  | { kind: "product"; productId: string }
  | { kind: "catalog" };

export type NotificationDestination = CustomerDestination | DriverDestination | ShopDestination;

export interface DestinationByAudience {
  customer: CustomerDestination;
  driver: DriverDestination;
  shop: ShopDestination;
}

/** Each audience's kinds, and the fields each kind requires / may carry. */
const KINDS: Record<NotificationAudience, Record<string, { required: string[]; optional: string[] }>> = {
  customer: {
    home: { required: [], optional: [] },
    orders: { required: [], optional: [] },
    order: { required: ["orderId"], optional: [] },
    points: { required: [], optional: [] },
    product: { required: ["productId"], optional: ["aisleKey"] },
    aisle: { required: ["aisleKey"], optional: ["title"] },
    search: { required: [], optional: ["query"] },
    sale: { required: [], optional: [] },
  },
  driver: {
    today: { required: [], optional: [] },
    run: { required: ["runId"], optional: [] },
    account: { required: [], optional: [] },
  },
  shop: {
    queue: { required: [], optional: ["fulfillmentId"] },
    product: { required: ["productId"], optional: [] },
    catalog: { required: [], optional: [] },
  },
};

export const DESTINATION_KINDS: { readonly [A in NotificationAudience]: readonly string[] } = {
  customer: Object.keys(KINDS.customer),
  driver: Object.keys(KINDS.driver),
  shop: Object.keys(KINDS.shop),
};

const nonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/**
 * A destination for `audience`, or `null`. `wire` is a JSON string or an already-parsed object. Unknown extra fields
 * are dropped; an optional field that is present but not a non-empty string is dropped too.
 */
export function parseDestination<A extends NotificationAudience>(
  audience: A,
  wire: unknown,
): DestinationByAudience[A] | null {
  let value: unknown = wire;
  if (typeof wire === "string") {
    try {
      value = JSON.parse(wire);
    } catch {
      return null;
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const kind = obj.kind;
  if (typeof kind !== "string") return null;
  const spec = Object.prototype.hasOwnProperty.call(KINDS[audience], kind) ? KINDS[audience][kind] : undefined;
  if (!spec) return null;

  const out: Record<string, string> = { kind };
  for (const f of spec.required) {
    const v = obj[f];
    if (!nonEmptyString(v)) return null;
    out[f] = v;
  }
  for (const f of spec.optional) {
    const v = obj[f];
    if (nonEmptyString(v)) out[f] = v;
  }
  return out as unknown as DestinationByAudience[A];
}

/** Compact JSON, fields in a fixed order (kind first), for storage and the push payload. */
export function serializeDestination(d: NotificationDestination): string {
  const { kind, ...rest } = d as { kind: string } & Record<string, unknown>;
  const ordered: Record<string, unknown> = { kind };
  for (const k of Object.keys(rest).sort()) {
    if (rest[k] !== undefined) ordered[k] = rest[k];
  }
  return JSON.stringify(ordered);
}

/** The shop console path a destination opens. Ids are percent-encoded; the console's own routes, nothing else. */
export function shopPathFor(d: ShopDestination | null): string {
  if (!d) return "/";
  switch (d.kind) {
    case "queue":
      return d.fulfillmentId ? `/orders/${encodeURIComponent(d.fulfillmentId)}` : "/orders";
    case "product":
      return `/catalog/${encodeURIComponent(d.productId)}`;
    case "catalog":
      return "/catalog";
  }
}

/**
 * The customer website path a destination opens (110): the storefront's own routes. `null` (an unknown kind) opens the
 * home page. Query values are percent-encoded.
 */
export function customerWebPathFor(d: CustomerDestination | null): string {
  if (!d) return "/";
  switch (d.kind) {
    case "home":
      return "/";
    case "orders":
      return "/orders";
    case "order":
      return `/orders/${encodeURIComponent(d.orderId)}`;
    case "points":
      return "/account/points";
    case "product":
      return `/product/${encodeURIComponent(d.productId)}`;
    case "aisle":
      return `/search?category=${encodeURIComponent(d.aisleKey)}`;
    case "search":
      return d.query ? `/search?q=${encodeURIComponent(d.query)}` : "/search";
    case "sale":
      return "/offers";
  }
}

/**
 * `POST /{audience}/v1/notifications/{id}/read` (109): the caller's own notification, now read. `destination` is the
 * stored one, as a plain object, so an app parses it with the same lenient parser it uses for a push.
 */
export interface NotificationReadResponseDTO {
  notificationId: string;
  /** ISO 8601. The first read time; a repeat keeps it. */
  readAt: string;
  destination: { [field: string]: string };
}

// ── 116: Effy links that open the customer app ───────────────────────────────────────────────────────────────────
// The paths the customer app claims (B7): exactly the pages `customerWebPathFor` produces, nothing else, so a new
// website page (help, legal, unsubscribe, sign-in) never opens the app by accident. The Android intent filter and the
// website's apple-app-site-association are written from this list (and their tests hold them to it).

export interface AppLinkPath {
  /** A path matched exactly, or a prefix ending in "/" (`/orders/`, `/product/`). */
  path: string;
  prefix: boolean;
}

export const APP_LINK_PATHS: readonly AppLinkPath[] = [
  { path: "/", prefix: false },
  { path: "/orders", prefix: false },
  { path: "/orders/", prefix: true },
  { path: "/account/points", prefix: false },
  { path: "/product/", prefix: true },
  { path: "/search", prefix: false },
  { path: "/offers", prefix: false },
];

const ONE_SEGMENT = /^[^/]+$/;

function decodeSegment(s: string): string | null {
  try {
    const v = decodeURIComponent(s);
    return v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * A link's path (and query) back to the customer destination it opens - the inverse of `customerWebPathFor`. Unknown
 * query keys (campaign tags) are ignored; `m` is the message the link came from. A path the app does not claim → null
 * (the app then opens home; a phone never hands it such a link). Search words decode as the website reads them (`+` is
 * a space). `/search` with both `category` and `q` opens the aisle.
 */
export function parseWebLink(pathAndQuery: string): { destination: CustomerDestination | null; messageId: string | null } {
  let url: URL;
  try {
    url = new URL(pathAndQuery, "https://effy.invalid");
  } catch {
    return { destination: null, messageId: null };
  }
  const q = url.searchParams;
  const messageId = q.get("m") || null;
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const tail = (prefix: string) => {
    const rest = path.slice(prefix.length);
    return ONE_SEGMENT.test(rest) ? decodeSegment(rest) : null;
  };
  let destination: CustomerDestination | null = null;
  if (path === "/") destination = { kind: "home" };
  else if (path === "/orders") destination = { kind: "orders" };
  else if (path.startsWith("/orders/")) {
    const orderId = tail("/orders/");
    destination = orderId ? { kind: "order", orderId } : null;
  } else if (path === "/account/points") destination = { kind: "points" };
  else if (path.startsWith("/product/")) {
    const productId = tail("/product/");
    destination = productId ? { kind: "product", productId } : null;
  } else if (path === "/search") {
    const category = q.get("category");
    const words = q.get("q");
    destination = category ? { kind: "aisle", aisleKey: category } : words ? { kind: "search", query: words } : { kind: "search" };
  } else if (path === "/offers") destination = { kind: "sale" };
  return { destination, messageId };
}

/**
 * 116: the full website address of a customer page - what every shopper link Effy writes is (emails, receipts), so the
 * same link opens the app where it is installed (APP_LINK_PATHS) and the website otherwise.
 */
export function customerWebUrlFor(siteUrl: string, d: CustomerDestination | null): string {
  return `${siteUrl.replace(/\/+$/, "")}${customerWebPathFor(d)}`;
}

export function customerDestinationForWebPath(pathAndQuery: string): CustomerDestination | null {
  return parseWebLink(pathAndQuery).destination;
}

// ── 116: how urgently an iPhone shows a notification (D7) ────────────────────────────────────────────────────────

export type InterruptionLevel = "active" | "passive" | "time-sensitive";

/** A real Apple team id (the SSM placeholder `off`, or anything else, is not). */
export function isAppleTeamId(v: string | null | undefined): boolean {
  return typeof v === "string" && /^[A-Z0-9]{10}$/.test(v);
}

/**
 * Important → time-sensitive (it breaks through Focus), importance winning over category; offers and news → passive (no
 * sound, no lighting up); everything else → active. Time-sensitive needs Apple's capability, so it is sent only when
 * switched on (the paid account); otherwise important is active. Never `critical`: it is not a value of this type.
 */
export function interruptionLevelFor(importance: string, category: string, timeSensitiveOn: boolean): InterruptionLevel {
  if (importance === "important") return timeSensitiveOn ? "time-sensitive" : "active";
  if (category === "offers" || category === "news") return "passive";
  return "active";
}
