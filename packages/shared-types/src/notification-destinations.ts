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
