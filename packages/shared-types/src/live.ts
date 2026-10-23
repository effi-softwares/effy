// The live channel's two wire shapes. An update carries the kind of thing that changed and nothing else
// (no id, status, amount or time), so a duplicate, late or reordered one is harmless and a customer's
// says nothing about a shop.

/** Every kind of thing an update may name. The list is closed. */
export const LIVE_KINDS = [
  "orders",
  "stock",
  "attention",
  "work",
  "dispatch",
  "slots",
  "review",
  // A customer's points balance changed (their own channel, and back-office's).
  "points",
  // Where Effy delivers changed. Back-office only: customers re-read when they next ask.
  "coverage",
  // A delivery fee plan was saved or made active. Back-office only: the intent catches a stale quote.
  "pricing",
  // A promotion or display group changed. Back-office only: customers re-read a group whenever shown.
  "promotions",
] as const;

export type LiveKind = (typeof LIVE_KINDS)[number];

export function isLiveKind(value: unknown): value is LiveKind {
  return typeof value === "string" && (LIVE_KINDS as readonly string[]).includes(value);
}

/** Reads one received event: anything but a known kind is `null` (a newer backend, not an error). */
export function parseLiveUpdate(raw: string): LiveKind | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const k = (value as { k?: unknown }).k;
    return isLiveKind(k) ? k : null;
  } catch {
    return null;
  }
}

/** What `GET /{audience}/v1/live` answers. `channelPrefix` is opaque: the client appends `/{epoch}` and nothing else. */
export interface LiveDescriptor {
  /** Host used for the handshake's authorization header. */
  httpHost: string;
  /** Host the socket connects to. */
  realtimeHost: string;
  channelPrefix: string;
  /** Length of an epoch. The channel is `{channelPrefix}/{floor(unix seconds / epochSeconds)}`. */
  epochSeconds: number;
  /** The server's clock (ISO 8601), so a wrong device clock cannot pick the wrong epoch. */
  serverTime: string;
}
