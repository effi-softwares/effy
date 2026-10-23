import { createHash } from "node:crypto";

/** Must never change: the cart deduplicates on ids derived in it. */
const SAVED_BULK_NAMESPACE = "9c0a2f31-6e58-4a0e-9b3f-3f6a1c7f2d54";

function uuidV5(namespace: string, name: string): string {
  const ns = Buffer.from(namespace.replaceAll("-", ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Stable across retries of one request and distinct per item. */
export function itemChangeId(changeId: string, productId: string): string {
  return uuidV5(SAVED_BULK_NAMESPACE, `${changeId}:${productId}`);
}
