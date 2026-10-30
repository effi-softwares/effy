// A slot is live the moment it is saved, so every refusal names its field and every change is audited.
// Never deleted, only switched off: a placed order must always name the window it was sold.

import type { FieldError, RequestScope } from "@effy/edge-shared";
import { effyDays } from "@effy/edge-shared/delivery";
import type { DeliverySlotDTO, DeliverySlotInput, DeliverySlotPatch, DeliverySlotsResponseDTO } from "@effy/shared-types";

import { recordAudit, type DeliveryConfigAuditAction } from "../shared/audit";
import { conflict, notFound, validationError } from "../shared/errors";
import * as repo from "./repository";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The DB CHECKs are the backstop; these put the message on the right field. "HH:MM" compares as text. */
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
  // No capacity is valid (no limit); only a given limit must be usable.
  if (v.capacity != null && (typeof v.capacity !== "number" || !Number.isInteger(v.capacity) || v.capacity < 1)) {
    errors.push({ field: "capacity", message: "a capacity limit must be a whole number of at least 1" });
  }
  return errors;
}

const DUPLICATE = () =>
  conflict("a slot with this window already exists", [
    { field: "startTime", message: "there is already a slot with these start and end times" },
  ]);
/** How a day with no time and asap are sold. */
const ANY_TIME_ALWAYS_ON = () =>
  conflict("the Any time window cannot be switched off", [
    { field: "status", message: "customers choosing a day without a time are delivered in it - change its hours or its limit instead" },
  ]);

export function listSlots(): Promise<DeliverySlotDTO[]> {
  return repo.listSlots();
}

/** Every window and its load on each Effy delivery day, from `effyDays` (the checkout's own calendar). */
export async function listSlotsWithDays(now: Date = new Date()): Promise<DeliverySlotsResponseDTO> {
  const [slots, calendar] = await Promise.all([repo.listSlots(), repo.calendarSettings()]);
  // A staff calendar: today is always shown.
  const days = effyDays(now, calendar.lookaheadDays, calendar.noWeekdays, calendar.noDates, true);
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
        // The result is validated, not the patch.
        const next: repo.SlotValues = {
          startTime: patch.startTime ?? current.startTime,
          endTime: patch.endTime ?? current.endTime,
          cutoffTime: patch.cutoffTime ?? current.cutoffTime,
          // `null` removes the limit; only an absent key keeps it.
          capacity: patch.capacity === undefined ? current.capacity : patch.capacity,
          anyTime: current.anyTime,
          status: patch.status ?? current.status,
        };
        if (next.anyTime && next.status !== "active") throw ANY_TIME_ALWAYS_ON();
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
