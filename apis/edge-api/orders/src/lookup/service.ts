// A label, typed code or order number opens its order. Every lookup, misses included, is recorded
// through @effy/edge-shared/labels in one transaction.
import { withTransaction } from "@effy/edge-shared";
import { recordReads } from "@effy/edge-shared/labels";
import type { AdminLookupDTO, ReadMethod } from "@effy/shared-types";

export async function lookup(sub: string, q: string, method: ReadMethod): Promise<AdminLookupDTO | null> {
  return withTransaction(async (tx) => {
    const [read] = await recordReads(tx, {
      actor: { kind: "admin_staff", sub },
      surface: "back_office",
      step: "lookup",
      reads: [{ clientReadId: crypto.randomUUID(), raw: q, method, deviceAt: new Date().toISOString() }],
      // Any bag that exists was found, voided or not.
      judge: () => "accepted",
    });
    const r = read?.resolved ?? null;
    if (!r) return null;
    if (r.kind === "order") return { orderId: r.orderId, orderNumber: r.orderNumber };
    return {
      orderId: r.orderId,
      orderNumber: r.orderNumber,
      fulfillmentId: r.packageId,
      parcelId: r.parcelId,
      ...(r.voided ? { voided: true } : {}),
      ...(r.cancelled ? { cancelled: true } : {}),
    };
  });
}
