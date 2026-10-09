// Moving an order between Effy and courier delivery, for back-office (081).
//
// ⚠ EVERY WRITE IS @effy/edge-shared/delivery override.ts — this file validates the request, opens
// the transaction, maps refusals, and does what must happen AFTER the commit: tell the screens, tell
// the drivers who lost work, send a refund that was recorded, count it. It never writes SQL.
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { emitMetric, logger, pooled, refused, withTransaction, type RequestScope } from "@effy/edge-shared";
import {
  DELIVERY_COMPENSATION_KINDS_SET, DeliveryMoveError, deliveryMovesFor, moveToCourier, moveToEffy, previewMove,
} from "@effy/edge-shared/delivery";
import { announceDispatch, announceOrder, announceSlots } from "@effy/edge-shared/live";
import { parseCents } from "@effy/edge-shared";
import type { DeliveryCompensationKind, DeliveryMovePreviewDTO, DeliveryMoveResponse, DeliveryType } from "@effy/shared-types";

import { refundService } from "../lib/money";

/** The orders service's metric namespace (one per service). */
const NAMESPACE = "Effy/Orders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REASON = 500;

/** A request a person must fix, field by field. */
export class DeliveryMoveInputError extends Error {
  constructor(readonly fields: { field: string; message: string }[]) {
    super("check the move");
  }
}

const REFUSAL_STATUS: Record<string, 404 | 409> = { not_found: 404 };

/** Map a refusal or an input error to its response; null for anything else. */
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

/** `GET …/delivery-move?to=` */
export async function preview(orderId: string, to: DeliveryType): Promise<DeliveryMovePreviewDTO> {
  if (!UUID.test(orderId)) throw new DeliveryMoveError("not_found");
  return previewMove(pooled, orderId, to);
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** `POST …/delivery-move` — both directions. */
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

  // ── After the commit. None of these may un-say the move. ─────────────────────────────────────
  emitMetric(NAMESPACE, "DeliveryOverrides", 1, { to: to! });
  if (to === "courier") emitMetric(NAMESPACE, "DeliveryCompensation", 1, { kind: result.compensation });
  // 071 — the order page (customer, shops, back-office), the drivers who lost it, the slot screen.
  await announceOrder(orderId, { slots: true, drivers: true });
  await announceDispatch(result.driverIds);
  await announceSlots();

  let refund: DeliveryMoveResponse["refund"];
  if (result.refundToSubmit) {
    try {
      refund = await refundService.submitRecorded(result.refundToSubmit);
    } catch (err) {
      // The refund is recorded and the reconciler will send it; the move happened.
      logger.error({ err, orderId }, "orders: a move's refund could not be submitted; the reconciler will retry");
      refund = { status: "submitting", stalled: true };
    }
  }
  const moves = await deliveryMovesFor(pooled, orderId);
  const recorded = moves.find((m) => m.id === result.overrideId) ?? moves[moves.length - 1]!;
  return { move: recorded, ...(refund ? { refund } : {}) };
}
