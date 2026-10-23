import { createHash } from "node:crypto";

/** An opaque, stable grouping token per shop, so customers see packages but never a shop id. */
export function packageKey(shopId: string): string {
  return `pkg_${createHash("sha256").update(`pkg:${shopId}`).digest("hex").slice(0, 12)}`;
}
