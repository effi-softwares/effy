// 096 — the shop's side of bags: declare how many were packed per zone, void one, record prints, and
// pack-scan labels (spec US1, US2, US4). Thin over the repository; each write announces the order so
// every open console re-reads it (071).

import { announceMoves } from "@effy/edge-shared/live";
import { emitMetric, metricNamespace } from "@effy/edge-shared";
import { MAX_PARCELS, type LabelReadDTO } from "@effy/shared-types";

import type { Actor } from "../fulfillments/service";
import { FulfillmentError } from "../fulfillments/types";
import * as orders from "../orders/repository";
import type { OrderDetail } from "../orders/types";
import * as repo from "./repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function changeIdOf(body: Record<string, unknown>): string {
  if (typeof body.changeId !== "string" || !UUID.test(body.changeId)) {
    throw new FulfillmentError("validation", "changeId is required", [{ field: "changeId", message: "must be a uuid" }]);
  }
  return body.changeId;
}

function count(body: Record<string, unknown>, field: "ambient" | "chilled" | "frozen"): number {
  const v = body[field];
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_PARCELS) {
    throw new FulfillmentError("validation", `${field} must be a whole number from 0 to ${MAX_PARCELS}`, [{ field, message: "invalid" }]);
  }
  return v;
}

const announce = (fulfillmentIds: readonly string[]) =>
  announceMoves(fulfillmentIds.map((fulfillmentId) => ({ fulfillmentId, from: null })), { ops: false });

/** PUT …/parcels — set the bag counts per zone. */
export async function declare(actor: Actor, fulfillmentId: string, body: Record<string, unknown>): Promise<OrderDetail> {
  changeIdOf(body);
  const counts = { ambient: count(body, "ambient"), chilled: count(body, "chilled"), frozen: count(body, "frozen") };
  const total = counts.ambient + counts.chilled + counts.frozen;
  if (total < 1 || total > MAX_PARCELS) {
    throw new FulfillmentError("unprocessable", `A package has between 1 and ${MAX_PARCELS} bags.`, undefined, "parcel_count");
  }
  await repo.declareParcels(fulfillmentId, actor.shopId, counts);
  await announce([fulfillmentId]);
  return orders.readOrder(fulfillmentId, actor.shopId);
}

/** POST …/parcels/{parcelId}/void — remove one bag. */
export async function voidBag(actor: Actor, fulfillmentId: string, parcelId: string, body: Record<string, unknown>): Promise<OrderDetail> {
  changeIdOf(body);
  if (!UUID.test(parcelId)) throw new FulfillmentError("not_found", "order not found");
  await repo.voidParcel(fulfillmentId, actor.shopId, parcelId, actor.staffId);
  await announce([fulfillmentId]);
  return orders.readOrder(fulfillmentId, actor.shopId);
}

const LAYOUTS = new Set(["a6", "a4x4", "roll62"]);
const PATHS = new Set(["browser", "zpl"]);

/** POST /shop/v1/fulfillments/parcels/prints — record that these labels were sent to a printer. */
export async function recordPrints(actor: Actor, body: Record<string, unknown>): Promise<{ recorded: number }> {
  const changeId = changeIdOf(body);
  const ids = body.parcelIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || !ids.every((x) => typeof x === "string" && UUID.test(x))) {
    throw new FulfillmentError("validation", "parcelIds must list the bags printed", [{ field: "parcelIds", message: "invalid" }]);
  }
  if (typeof body.layout !== "string" || !LAYOUTS.has(body.layout)) {
    throw new FulfillmentError("validation", "unknown label layout", [{ field: "layout", message: "a6, a4x4 or roll62" }]);
  }
  if (typeof body.path !== "string" || !PATHS.has(body.path)) {
    throw new FulfillmentError("validation", "unknown printing path", [{ field: "path", message: "browser or zpl" }]);
  }
  const out = await repo.recordPrints(actor.shopId, actor.staffId, ids as string[], body.layout as "a6", body.path as "browser", changeId);
  if (out.recorded > 0) emitMetric(metricNamespace(), "LabelPrinted", out.recorded, { path: body.path });
  await announce(out.fulfillmentIds);
  return { recorded: out.recorded };
}

/** POST …/parcels/pack-scans — confirm bags as they are packed. */
export async function packScan(actor: Actor, fulfillmentId: string, body: Record<string, unknown>): Promise<OrderDetail> {
  const changeId = changeIdOf(body);
  const reads = body.reads;
  if (!Array.isArray(reads) || reads.length === 0 || reads.length > 200) {
    throw new FulfillmentError("validation", "reads must list the labels scanned", [{ field: "reads", message: "invalid" }]);
  }
  if (!actor.staffId) throw new FulfillmentError("not_found", "order not found");
  await repo.packScan(fulfillmentId, actor.shopId, actor.staffId, changeId, reads as Array<Partial<LabelReadDTO>>);
  await announce([fulfillmentId]);
  return orders.readOrder(fulfillmentId, actor.shopId);
}
