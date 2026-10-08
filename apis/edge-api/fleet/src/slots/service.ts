// Same-day delivery slots (069 US5). The access decision lives in the handler's guard; this layer
// owns the rules and the refusals.
//
// ⚠ A SLOT IS LIVE THE MOMENT IT IS SAVED. There is no draft and no release between this service and
// a customer's checkout, which is why every refusal here names its field and every change is audited.
//
// ⚠ A SLOT IS NEVER DELETED, only switched off. A booking references it, and a placed order must
// always be able to say which window it was sold. There is deliberately no delete in this file.

import type { FieldError, RequestScope } from "@effy/edge-shared";
import { effyDays } from "@effy/edge-shared/delivery";
import type { DeliverySlotDTO, DeliverySlotInput, DeliverySlotPatch, DeliverySlotsResponseDTO } from "@effy/shared-types";

import { recordAudit, type DeliveryConfigAuditAction } from "../shared/audit";
import { conflict, notFound, validationError } from "../shared/errors";
import * as repo from "./repository";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * FR-037, with a name on each refusal. The database CHECKs say the same three things; they are the
 * backstop, and this is what lets the console put the message on the right field.
 *
 * "HH:MM" strings compare correctly as text, so no time is parsed here — and none is rebuilt.
 */
export function slotProblems(v: { startTime: unknown; endTime: unknown; cutoffTime: unknown; capacity?: unknown }): FieldError[] {
  const errors: FieldError[] = [];
  const time = (value: unknown, field: string, label: string): value is string => {
    if (typeof value === "string" && HHMM.test(value)) return true;
    errors.push({ field, message: `${label} must be a time of day, like 17:00` });
    return false;
  };

  const start = time(v.startTime, "startTime", "start");
  const end = time(v.endTime, "endTime", "end");
  const cutoff = time(v.cutoffTime, "cutoffTime", "cutoff");

  if (start && end && (v.endTime as string) <= (v.startTime as string)) {
    errors.push({ field: "endTime", message: "the slot must end after it starts" });
  }
  if (start && cutoff && (v.cutoffTime as string) > (v.startTime as string)) {
    errors.push({ field: "cutoffTime", message: "the cutoff cannot be after the slot starts" });
  }
  // ⚠ No capacity IS a valid answer, and the default: the slot has no limit. Only a limit that was
  // given has to be a usable one.
  if (v.capacity != null && (typeof v.capacity !== "number" || !Number.isInteger(v.capacity) || v.capacity < 1)) {
    errors.push({ field: "capacity", message: "a capacity limit must be a whole number of at least 1" });
  }
  return errors;
}

const DUPLICATE = () =>
  conflict("a slot with this window already exists", [
    { field: "startTime", message: "there is already a slot with these start and end times" },
  ]);

export function listSlots(): Promise<DeliverySlotDTO[]> {
  return repo.listSlots();
}

/**
 * Every window, and how full each is on today and the Effy delivery days after it (078 US8).
 *
 * ⚠ THE DAYS ARE THE CUSTOMER'S DAYS. They come from `effyDays` — the function the checkout quote
 * lays its windows out on — so the grid's columns are exactly the days a customer can be offered,
 * with the same days skipped. A calendar worked out here would be a second one.
 */
export async function listSlotsWithDays(now: Date = new Date()): Promise<DeliverySlotsResponseDTO> {
  const [slots, calendar] = await Promise.all([repo.listSlots(), repo.calendarSettings()]);
  const days = effyDays(now, calendar.lookaheadDays, calendar.noWeekdays, calendar.noDates);
  const dates = days.map((d) => d.date);
  const load = await repo.loadOnDays(dates);
  const empty = dates.map((date) => ({ date, booked: 0, overCapacity: 0 }));
  return {
    items: slots.map((s) => ({ ...s, load: load.get(s.id) ?? empty })),
    days,
  };
}

export async function createSlot(body: DeliverySlotInput, actorSub: string, scope: RequestScope): Promise<DeliverySlotDTO> {
  const problems = slotProblems(body ?? {});
  if (problems.length > 0) throw validationError("check the slot's times and capacity", problems);

  const capacity = body.capacity ?? null;
  let id: string;
  try {
    id = await repo.insertSlot({ ...body, capacity }, actorSub, (tx, slotId) =>
      recordAudit(
        {
          actorSub, action: "delivery_slot.created", targetType: "delivery_slot", driverId: slotId,
          detail: { startTime: body.startTime, endTime: body.endTime, cutoffTime: body.cutoffTime, capacity },
        },
        tx,
      ),
    );
  } catch (err) {
    if (repo.isDuplicateWindow(err)) throw DUPLICATE();
    throw err;
  }
  scope.log.info({ slotId: id }, "delivery slot created");
  return (await repo.getSlot(id))!;
}

export async function updateSlot(id: string, patch: DeliverySlotPatch, actorSub: string, scope: RequestScope): Promise<DeliverySlotDTO> {
  if (!UUID.test(id)) throw notFound("slot not found");
  if (patch.status !== undefined && patch.status !== "active" && patch.status !== "disabled") {
    throw validationError("check the slot's status", [{ field: "status", message: "status must be active or disabled" }]);
  }

  let found: boolean;
  try {
    found = await repo.updateSlot(
      id,
      (current) => {
        // ⚠ The RESULT is validated, not the patch: moving only the start past the existing end is a
        // one-field patch that produces an invalid slot.
        const next: repo.SlotValues = {
          startTime: patch.startTime ?? current.startTime,
          endTime: patch.endTime ?? current.endTime,
          cutoffTime: patch.cutoffTime ?? current.cutoffTime,
          // ⚠ `null` is a VALUE here — it removes the limit — so only an absent key keeps the old one.
          capacity: patch.capacity === undefined ? current.capacity : patch.capacity,
          status: patch.status ?? current.status,
        };
        const problems = slotProblems(next);
        if (problems.length > 0) throw validationError("check the slot's times and capacity", problems);
        return next;
      },
      actorSub,
      async (tx, before, after) => {
        const changed: Record<string, unknown> = {};
        for (const key of ["startTime", "endTime", "cutoffTime", "capacity", "status"] as const) {
          if (before[key] !== after[key]) changed[key] = { from: before[key], to: after[key] };
        }
        let action: DeliveryConfigAuditAction = "delivery_slot.updated";
        if (before.status !== after.status) {
          action = after.status === "disabled" ? "delivery_slot.disabled" : "delivery_slot.enabled";
        }
        await recordAudit({ actorSub, action, targetType: "delivery_slot", driverId: id, detail: { changed } }, tx);
      },
    );
  } catch (err) {
    if (repo.isDuplicateWindow(err)) throw DUPLICATE();
    throw err;
  }
  if (!found) throw notFound("slot not found");
  scope.log.info({ slotId: id }, "delivery slot updated");
  return (await repo.getSlot(id))!;
}
