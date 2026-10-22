// 096 US5 — "scan anything to find it" (FR-040): a bag label, a typed code or an order number opens
// its order. Every lookup is a read on the record, with who looked and how, like any other read.
//
// ⚠ The resolving is `@effy/edge-shared/labels`' one resolver and the record its one writer — this
// module only joins them in one transaction. A miss is recorded too (`not_found`): a code nobody can
// find is exactly what the read report is for.
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
      // Finding is the point: any bag that exists was found, voided or not.
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
