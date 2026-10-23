// Every write goes through @effy/edge-shared/delivery override.ts. This validates, maps refusals and,
// after the commit, tells the screens and affected drivers and sends any recorded refund.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { emitMetric, logger, pooled, refused, withTransaction, type RequestScope } from "@effy/edge-shared";
import {
  changeEffyWindow, DELIVERY_COMPENSATION_KINDS_SET, DeliveryMoveError, deliveryMovesFor, moveToCourier, moveToEffy, previewMove,
} from "@effy/edge-shared/delivery";
import { announceDispatch, announceOrder, announceSlots } from "@effy/edge-shared/live";
import { parseCents } from "@effy/edge-shared";
import type { DeliveryCompensationKind, DeliveryMovePreviewDTO, DeliveryMoveResponse, DeliveryType } from "@effy/shared-types";

import { refundService } from "../lib/money";

const NAMESPACE = "Effy/Orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REASON = 500;

export class DeliveryMoveInputError extends Error {
  constructor(readonly fields: { field: string; message: string }[]) {
    super("check the move");
  }
}

const REFUSAL_STATUS: Record<string, 404 | 409> = { not_found: 404 };

/** null for anything that is not a refusal or input error. */
export function deliveryMoveError(err: unknown, scope: RequestScope): APIGatewayProxyStructuredResultV2 | null {
  if (err instanceof DeliveryMoveError) {
    return refused(scope, REFUSAL_STATUS[err.code] ?? 409, err.code, err.message, { code: err.code, ...(err.preview ? { preview: err.preview } : {}) });
  }
  if (err instanceof DeliveryMoveInputError) {
    return refused(scope, 400, "validation_failed", err.message, { code: "validation_failed", fields: err.fields });
  }
  return null;
}

export function parseTo(v: unknown): DeliveryType | null {
  return v === "courier" || v === "effy" ? v : null;
}

/** Gives an Effy order another window or day; see `changeEffyWindow`. */
export async function changeWindow(
  orderId: string,
  body: Record<string, unknown>,
  actorSub: string,
): Promise<{ orderId: string; promise: "window" | "day" }> {
  if (!UUID.test(orderId)) throw new DeliveryMoveError("not_found");
  const fields: { field: string; message: string }[] = [];
  const reason = text(body.reason);
  if (reason === "") fields.push({ field: "reason", message: "say why" });
  if (reason.length > MAX_REASON) fields.push({ field: "reason", message: `at most ${MAX_REASON} characters` });
  const expectedUpdatedAt = text(body.expectedUpdatedAt);
  if (expectedUpdatedAt === "" || Number.isNaN(Date.parse(expectedUpdatedAt))) fields.push({ field: "expectedUpdatedAt", message: "open the order again" });
  const w = body.window as { slotId?: unknown; date?: unknown } | null | undefined;
  if (!w || typeof w.slotId !== "string" || !UUID.test(w.slotId) || typeof w.date !== "string" || !ISO_DATE.test(w.date)) {
    fields.push({ field: "window", message: "choose a day or a window" });
  }
  if (fields.length > 0) throw new DeliveryMoveInputError(fields);

  const result = await withTransaction((tx) =>
    changeEffyWindow(tx, { orderId, actorSub, reason, window: { slotId: w!.slotId as string, date: w!.date as string }, expectedUpdatedAt }),
  );
  emitMetric(NAMESPACE, "DeliveryWindowChanges", 1, { promise: result.promise });
  await announceOrder(orderId, { slots: true, drivers: true });
  await announceDispatch(result.driverIds);
  await announceSlots();
  return { orderId, promise: result.promise };
}

export async function preview(orderId: string, to: DeliveryType): Promise<DeliveryMovePreviewDTO> {
  if (!UUID.test(orderId)) throw new DeliveryMoveError("not_found");
  return previewMove(pooled, orderId, to);
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Both directions. */
export async function move(orderId: string, body: Record<string, unknown>, actorSub: string): Promise<DeliveryMoveResponse> {
  if (!UUID.test(orderId)) throw new DeliveryMoveError("not_found");
  const fields: { field: string; message: string }[] = [];
  const to = parseTo(body.to);
  if (!to) fields.push({ field: "to", message: "move to courier or effy" });
  const reason = text(body.reason);
  if (reason === "") fields.push({ field: "reason", message: "say why the order is being moved" });
  if (reason.length > MAX_REASON) fields.push({ field: "reason", message: `at most ${MAX_REASON} characters` });
  const expectedUpdatedAt = text(body.expectedUpdatedAt);
  if (expectedUpdatedAt === "" || Number.isNaN(Date.parse(expectedUpdatedAt))) fields.push({ field: "expectedUpdatedAt", message: "open the preview first" });

  let compensation: DeliveryCompensationKind = "none";
  let expectedAmountCents = 0;
  const note = text(body.compensationNote);
  let window: { slotId: string; date: string } | null = null;
  if (to === "courier") {
    if (typeof body.compensation !== "string" || !DELIVERY_COMPENSATION_KINDS_SET.has(body.compensation)) {
      fields.push({ field: "compensation", message: "choose how to make it right" });
    } else {
      compensation = body.compensation as DeliveryCompensationKind;
    }
    if (compensation === "none" && note === "") fields.push({ field: "compensationNote", message: "say why nothing is given" });
    if (note.length > MAX_REASON) fields.push({ field: "compensationNote", message: `at most ${MAX_REASON} characters` });
    try {
      expectedAmountCents = parseCents(text(body.expectedAmount));
    } catch {
      fields.push({ field: "expectedAmount", message: "open the preview first" });
    }
  } else if (to === "effy") {
    const w = body.window as { slotId?: unknown; date?: unknown } | null | undefined;
    if (!w || typeof w.slotId !== "string" || !UUID.test(w.slotId) || typeof w.date !== "string" || !ISO_DATE.test(w.date)) {
      fields.push({ field: "window", message: "choose a window" });
    } else {
      window = { slotId: w.slotId, date: w.date };
    }
  }
  if (fields.length > 0) throw new DeliveryMoveInputError(fields);

  const result = await withTransaction((tx) =>
    to === "courier"
      ? moveToCourier(tx, { orderId, actorSub, reason, compensation, compensationNote: note || null, expectedUpdatedAt, expectedAmountCents })
      : moveToEffy(tx, { orderId, actorSub, reason, window: window!, expectedUpdatedAt }),
  );

  // After the commit; none of these may undo the move.
  emitMetric(NAMESPACE, "DeliveryOverrides", 1, { to: to! });
  if (to === "courier") emitMetric(NAMESPACE, "DeliveryCompensation", 1, { kind: result.compensation });
  await announceOrder(orderId, { slots: true, drivers: true });
  await announceDispatch(result.driverIds);
  await announceSlots();

  let refund: DeliveryMoveResponse["refund"];
  if (result.refundToSubmit) {
    try {
      refund = await refundService.submitRecorded(result.refundToSubmit);
    } catch (err) {
      // The refund is recorded and the reconciler will send it.
      logger.error({ err, orderId }, "orders: a move's refund could not be submitted; the reconciler will retry");
      refund = { status: "submitting", stalled: true };
    }
  }
  const moves = await deliveryMovesFor(pooled, orderId);
  const recorded = moves.find((m) => m.id === result.overrideId) ?? moves[moves.length - 1]!;
  return { move: recorded, ...(refund ? { refund } : {}) };
}
