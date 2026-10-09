// Courier consignments and a courier order's collection mode, for back-office (080).
//
// ⚠ EVERY WRITE IS @effy/edge-shared/delivery consignment.ts — this file opens the transaction, maps
// its refusals and announces after the commit. It never writes SQL of its own.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { presignLabelUpload, refused, withTransaction, type RequestScope } from "@effy/edge-shared";
import {
  bookConsignment, changeCourierCollection, ConsignmentRefusal, recordConsignmentStep, type ConsignmentStepInput,
} from "@effy/edge-shared/delivery";
import { announceOrder } from "@effy/edge-shared/live";
import type { ConsignmentEventInput, ConsignmentInput, CourierCollectionInput } from "@effy/shared-types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const STEPS: readonly ConsignmentStepInput["kind"][] = ["in_transit", "delivered", "failed", "lost", "damaged", "returned", "resolved", "cancelled"];

/** A request a person must fix, field by field. */
export class ConsignmentInputError extends Error {
  constructor(readonly fields: { field: string; message: string }[]) {
    super("check the consignment");
  }
}

const REFUSAL_STATUS: Record<string, 404 | 409 | 422> = {
  not_found: 404, not_courier: 409, not_collected: 409, not_ready: 409, not_standard: 422, not_carrier: 422,
  service_unavailable: 422, service_not_supplier: 422, consignment_handed_over: 409, not_booked: 409,
  invalid_step: 409, collection_locked: 409, collection_assigned: 409, pickup_in_past: 422,
};

/** Map a refusal or an input error to its response; null for anything else. */
export function consignmentError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 | null {
  if (err instanceof ConsignmentRefusal) return refused(scope, REFUSAL_STATUS[err.code] ?? 409, err.code, err.message, { code: err.code });
  if (err instanceof ConsignmentInputError) return refused(scope, 422, "invalid_consignment", err.message, { code: "invalid_consignment", fields: err.fields });
  return null;
}

const orderOfPackage = (tx: { query: (t: string, v: unknown[]) => Promise<{ rows: { order_id: string }[] }> }, id: string) =>
  tx.query(`SELECT order_id::text AS order_id FROM public.shop_fulfillment WHERE id = $1`, [id]).then((r) => r.rows[0]?.order_id ?? null);

function text(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  return typeof v === "string" ? v.trim().slice(0, max) || null : null;
}

/** Book a consignment, or edit its booking (contracts § Orders). */
export async function saveConsignment(packageId: string, body: ConsignmentInput, actorSub: string): Promise<{ consignmentId: string; created: boolean }> {
  const fields: { field: string; message: string }[] = [];
  if (!UUID.test(packageId)) throw new ConsignmentRefusal("not_found", "that package does not exist");
  if (typeof body?.serviceId !== "string" || !UUID.test(body.serviceId)) fields.push({ field: "serviceId", message: "choose a courier service" });
  const tracking = text(body?.trackingUrl, 500);
  if (tracking !== null && !/^https:\/\//.test(tracking)) fields.push({ field: "trackingUrl", message: "a tracking link starts with https://" });
  const label = text(body?.labelKey, 300);
  if (label !== null && !label.startsWith(`courier-label/${packageId}/`)) fields.push({ field: "labelKey", message: "upload the label for this package first" });
  const pickup = body?.pickup ?? null;
  if (pickup) {
    if (typeof pickup.date !== "string" || !ISO_DATE.test(pickup.date)) fields.push({ field: "pickup.date", message: "a date like 2026-10-12" });
    const from = text(pickup.from, 5);
    const to = text(pickup.to, 5);
    if ((from === null) !== (to === null) || (from && (!CLOCK.test(from) || !CLOCK.test(to!) || from >= to!))) {
      fields.push({ field: "pickup.from", message: "a pickup window is a start and a later end, like 13:00 to 15:00" });
    }
  }
  if (fields.length > 0) throw new ConsignmentInputError(fields);

  const out = await withTransaction(async (tx) => {
    const saved = await bookConsignment(tx, {
      packageId, serviceId: body.serviceId, reference: text(body.reference, 100), trackingUrl: tracking, labelKey: label,
      pickup: pickup ? { date: pickup.date, from: text(pickup.from, 5), to: text(pickup.to, 5) } : null,
      actor: { kind: "staff", sub: actorSub }, now: new Date(),
    });
    return { ...saved, orderId: await orderOfPackage(tx, packageId) };
  });
  // 071 — the supplier's pickup row and the order page both show the booking.
  if (out.orderId) await announceOrder(out.orderId);
  return { consignmentId: out.consignmentId, created: out.created };
}

/** Record a step: in transit, delivered, a problem, resolved, cancelled. */
export async function recordStep(packageId: string, body: ConsignmentEventInput, actorSub: string): Promise<{ orderFinished: boolean }> {
  if (!UUID.test(packageId)) throw new ConsignmentRefusal("not_found", "that package does not exist");
  if (!(STEPS as readonly string[]).includes(body?.kind as string)) {
    throw new ConsignmentInputError([{ field: "kind", message: `one of ${STEPS.join(", ")}` }]);
  }
  const out = await withTransaction((tx) =>
    recordConsignmentStep(tx, { packageId, kind: body.kind as ConsignmentStepInput["kind"], actor: { kind: "staff", sub: actorSub }, note: text(body.note, 500) }),
  );
  await announceOrder(out.orderId);
  return { orderFinished: out.orderFinished };
}

/** A presigned upload for this package's label. Nothing is written until the booking names it. */
export async function labelUpload(packageId: string, body: { contentType?: unknown; fileSize?: unknown }) {
  if (!UUID.test(packageId)) throw new ConsignmentRefusal("not_found", "that package does not exist");
  const { uploadUrl, storageKey, contentType } = await presignLabelUpload(packageId, body?.contentType, body?.fileSize);
  return { labelKey: storageKey, uploadUrl, contentType };
}

/** Change how one courier order's parcels reach the courier. */
export async function changeCollection(orderId: string, body: CourierCollectionInput, actorSub: string): Promise<{ changed: boolean }> {
  if (!UUID.test(orderId)) throw new ConsignmentRefusal("not_found", "that order does not exist");
  if (body?.mode !== "hub" && body?.mode !== "supplier") throw new ConsignmentInputError([{ field: "mode", message: "hub or supplier" }]);
  const out = await withTransaction((tx) => changeCourierCollection(tx, { orderId, to: body.mode, actorSub, note: text(body.note, 500) }));
  // ⚠ Drivers too: a package leaving the hub route stops being collection work.
  if (out.changed) await announceOrder(orderId, { drivers: true });
  return { changed: out.changed };
}
