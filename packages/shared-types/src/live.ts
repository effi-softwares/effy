// 071-live-updates — the live channel's two wire shapes.
//
// ⚠ An update carries the KIND of thing that changed and nothing else (FR-002). No id, no status, no
// amount, no time. That is what makes a duplicate, late or reordered update harmless (FR-003) and
// what keeps a customer's update from saying anything about a shop (FR-024). Adding a field here is
// a spec change, not a convenience.

/** Every kind of thing an update may name. The list is closed. */
export const LIVE_KINDS = [
  "orders",
  "stock",
  "attention",
  "work",
  "dispatch",
  "slots",
  "review",
] as const;

export type LiveKind = (typeof LIVE_KINDS)[number];

/** The whole of an update, as published and as received. */
export interface LiveUpdate {
  k: LiveKind;
}

export function isLiveKind(value: unknown): value is LiveKind {
  return typeof value === "string" && (LIVE_KINDS as readonly string[]).includes(value);
}

/**
 * Read one received event. Anything that is not exactly a known kind yields `null` and is ignored
 * by the caller — an unknown kind is a newer backend, not an error.
 */
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

/**
 * What `GET /{audience}/v1/live` answers: where the channel is and which one is this person's.
 * `channelPrefix` is opaque — the client appends `/{epoch}` and nothing else, and never builds a
 * channel from an id it holds.
 */
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
