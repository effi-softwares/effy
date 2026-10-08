// Which days delivery runs, and the timings the day rules depend on (069 US6; Effy delivery days since 078).
//
// ⚠ LIVE ON SAVE, like the slots: the next checkout quote reads these. Every refusal names its field.

import type { FieldError, RequestScope } from "@effy/edge-shared";
import type { DeliveryDaysDTO, DeliveryDaysInput, NonDeliveryDateDTO, NonDeliveryDateInput } from "@effy/shared-types";

import { recordAudit } from "../shared/audit";
import { conflict, notFound, validationError } from "../shared/errors";
import * as repo from "./repository";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  // ⚠ Round-trips, so 2026-02-30 is refused rather than silently becoming 2 March.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const wholeNumber = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

/** The same limits the migration's CHECKs enforce, with a name on each. */
export function daysProblems(v: Partial<DeliveryDaysInput>): FieldError[] {
  const errors: FieldError[] = [];
  if (!wholeNumber(v.lookaheadDays, 1, 30)) {
    errors.push({ field: "lookaheadDays", message: "customers can be offered between 1 and 30 days" });
  }
  const w = v.noDeliveryWeekdays;
  if (!Array.isArray(w) || w.some((d) => !wholeNumber(d, 1, 7)) || new Set(w).size !== w.length) {
    errors.push({ field: "noDeliveryWeekdays", message: "weekdays must be numbers 1 (Monday) to 7 (Sunday), each once" });
  } else if (w.length === 7) {
    // ⚠ FR-020: a served address must always be offered a standard day.
    errors.push({ field: "noDeliveryWeekdays", message: "at least one day of the week must have delivery" });
  }
  if (!wholeNumber(v.carrierLeadDays, 0, 14)) {
    errors.push({ field: "carrierLeadDays", message: "the carrier lead time must be between 0 and 14 days" });
  }
  if (!wholeNumber(v.slotHoldMin, 1, 60)) {
    errors.push({ field: "slotHoldMin", message: "a place can be held for between 1 and 60 minutes" });
  }
  // 078 — optional: a console built before it does not send it, and the stored value is kept.
  if (v.effyLookaheadDays !== undefined && !wholeNumber(v.effyLookaheadDays, 1, 14)) {
    errors.push({ field: "effyLookaheadDays", message: "customers can be offered between 1 and 14 delivery days after today" });
  }
  if (!wholeNumber(v.hubTurnaroundMin, 0, 480)) {
    errors.push({ field: "hubTurnaroundMin", message: "the hub turnaround must be between 0 and 480 minutes" });
  }
  return errors;
}

export async function getDeliveryDays(): Promise<DeliveryDaysDTO> {
  return (await repo.read()).dto;
}

export async function putDeliveryDays(body: DeliveryDaysInput, actorSub: string, scope: RequestScope): Promise<DeliveryDaysDTO> {
  const problems = daysProblems(body ?? {});
  if (problems.length > 0) throw validationError("check the delivery day settings", problems);

  const v: DeliveryDaysInput = {
    lookaheadDays: body.lookaheadDays,
    noDeliveryWeekdays: [...body.noDeliveryWeekdays].sort((a, b) => a - b),
    carrierLeadDays: body.carrierLeadDays,
    slotHoldMin: body.slotHoldMin,
    hubTurnaroundMin: body.hubTurnaroundMin,
    ...(body.effyLookaheadDays !== undefined ? { effyLookaheadDays: body.effyLookaheadDays } : {}),
  };
  const saved = await repo.save(v, actorSub, (tx) =>
    recordAudit({ actorSub, action: "delivery_days.updated", targetType: "delivery_settings", driverId: null, detail: { ...v } }, tx),
  );
  if (!saved) {
    // ⚠ Named, not a 500. The row is created by Delivery › Settings (047), where the hub is set; this
    // screen cannot create it without inventing the hub's coordinates.
    throw conflict("set the delivery hub in Delivery settings first — these settings are saved with it");
  }
  scope.log.info("delivery days updated");
  return (await repo.read()).dto;
}

export async function addNonDeliveryDate(body: NonDeliveryDateInput, actorSub: string, scope: RequestScope): Promise<NonDeliveryDateDTO> {
  if (!isRealDay(body?.day)) {
    throw validationError("check the date", [{ field: "day", message: "the date must be a real day, like 2026-12-25" }]);
  }
  const label = typeof body.label === "string" && body.label.trim() !== "" ? body.label.trim().slice(0, 80) : null;
  const out = await repo.addDate(body.day, label, actorSub, (tx) =>
    recordAudit(
      { actorSub, action: "delivery_days.date_added", targetType: "delivery_settings", driverId: null, detail: { day: body.day, label } },
      tx,
    ),
  );
  scope.log.info({ day: body.day, affectedOrders: out.affectedOrders }, "non-delivery date added");
  return out;
}

export async function removeNonDeliveryDate(day: string, actorSub: string, scope: RequestScope): Promise<void> {
  if (!isRealDay(day)) throw notFound("date not found");
  const removed = await repo.removeDate(day, (tx) =>
    recordAudit(
      { actorSub, action: "delivery_days.date_removed", targetType: "delivery_settings", driverId: null, detail: { day } },
      tx,
    ),
  );
  if (!removed) throw notFound("date not found");
  scope.log.info({ day }, "non-delivery date removed");
}
