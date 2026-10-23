/**
 * Where an update is published and what an app may subscribe to: `/{namespace}/{scope id}/{epoch}`.
 * A subscription is authorized once, so the epoch makes the channel expire and every app re-subscribes
 * and is re-checked. The kind travels in the update, not the path, so the authorizer refuses every
 * wildcard.
 */

export const EPOCH_SECONDS = 600;
/** How long two epochs overlap on each side of a boundary. */
export const EPOCH_MARGIN_SECONDS = 60;

export const LIVE_NAMESPACES = ["shop", "customer", "driver", "ops"] as const;
export type LiveNamespace = (typeof LIVE_NAMESPACES)[number];

/** The single channel every back-office account shares. */
export const OPS_SCOPE_ID = "all";

/** A channel segment the service accepts: letters, digits and inner dashes, 50 at most. */
const SEGMENT = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,48}[A-Za-z0-9])?$/;

export function epochOf(nowMs: number): number {
  return Math.floor(nowMs / 1000 / EPOCH_SECONDS);
}

/**
 * The epochs a change is published to. Just after a boundary the previous epoch is still published
 * to: an app whose clock is a little behind, or whose next subscription is still in flight, is on
 * it for a few more seconds and must not miss what happens in them.
 */
export function publishEpochs(nowMs: number): number[] {
  const current = epochOf(nowMs);
  const intoEpoch = nowMs / 1000 - current * EPOCH_SECONDS;
  return intoEpoch < EPOCH_MARGIN_SECONDS ? [current, current - 1] : [current];
}

/**
 * The epochs a subscription may name: this one, and the next (apps subscribe to it a minute early
 * so nothing is missed across the boundary). Never an older one, never one further ahead.
 */
export function subscribableEpochs(nowMs: number): number[] {
  const current = epochOf(nowMs);
  return [current, current + 1];
}

/** The part of a channel that identifies whose it is. An app appends `/{epoch}` and nothing else. */
export function channelPrefix(namespace: LiveNamespace, scopeId: string): string {
  if (!SEGMENT.test(scopeId)) {
    // The service would reject it silently at publish time; refuse here, where the stack names the caller.
    throw new Error(`live: "${namespace}" scope id is not a valid channel segment`);
  }
  return `/${namespace}/${scopeId}`;
}

export interface ParsedChannel {
  namespace: LiveNamespace;
  scopeId: string;
  epoch: number;
}

/** `null` for anything but exactly `/{known namespace}/{segment}/{digits}`: wildcards, trailing slash, extra or empty segments. */
export function parseChannel(path: string): ParsedChannel | null {
  if (!path.startsWith("/")) return null;
  const parts = path.slice(1).split("/");
  if (parts.length !== 3) return null;
  const [namespace, scopeId, epoch] = parts as [string, string, string];
  if (!(LIVE_NAMESPACES as readonly string[]).includes(namespace)) return null;
  if (!SEGMENT.test(scopeId)) return null;
  if (!/^[0-9]{1,12}$/.test(epoch)) return null;
  return { namespace: namespace as LiveNamespace, scopeId, epoch: Number(epoch) };
}
