import { createHash } from "node:crypto";

/**
 * The namespace bulk add-to-cart derives its per-item change ids in.
 *
 * ⚠ FIXED, AND IT MUST NEVER CHANGE. The cart deduplicates on the derived id; a different
 * namespace would derive different ids for the same request, and a retry issued across the change
 * would add every item a second time.
 */
const SAVED_BULK_NAMESPACE = "9c0a2f31-6e58-4a0e-9b3f-3f6a1c7f2d54";

/** RFC 4122 version 5 (SHA-1, namespaced). */
function uuidV5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * One item's change id, derived from the request's and the product's.
 *
 * ⚠ It must be STABLE across a retry of the same request — a random one would defeat the cart's
 * dedupe — and DISTINCT per item: one id across the batch would let the cart treat the second
 * item as a retry of the first. The derivation is that of the backend 070 retired, to the bit.
 */
export function itemChangeId(changeId: string, productId: string): string {
  return uuidV5(SAVED_BULK_NAMESPACE, `${changeId}:${productId}`);
}
