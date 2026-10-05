import { createHash } from "node:crypto";

/**
 * A shop id → an OPAQUE, stable grouping token for the customer surfaces.
 *
 * Items sharing a package key are shown as one anonymous "package". The token is a truncated hash
 * of the shop id — deterministic (the same shop always groups the same way) but NOT the shop id
 * itself, so it reveals no shop identity and cannot be correlated with the shop ids used on the
 * operator surfaces. Hidden fulfilment holds: the split shows, the shop never does.
 */
export function packageKey(shopId: string): string {
  return `pkg_${createHash("sha256").update(`pkg:${shopId}`).digest("hex").slice(0, 12)}`;
}
