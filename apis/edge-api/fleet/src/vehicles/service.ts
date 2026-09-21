// Vehicle register use-cases (061). The access decision lives in the handler's guard; this layer owns
// the domain rules and the refusals.
//
// ⚠ EVERY REFUSAL NAMES THE SITUATION. A generic 409 is worse than useless here: 053 shipped a
// console where every refusal collapsed into one sentence, because the screen tested
// `e instanceof Error` while the client throws a plain object — the server got it right and the UI
// discarded it. `fields` is what survives to the screen, so it is populated on purpose.

import type { RequestScope } from "@effy/edge-shared";
import type {
  VehicleCreateRequest,
  VehicleDetail,
  VehicleStatus,
  VehicleStatusRequest,
  VehicleUpdateRequest,
} from "@effy/shared-types";

import { recordAudit } from "../shared/audit";
import { conflict, notFound, validationError } from "../shared/errors";
import * as repo from "./repository";

const BODY_TYPES = ["van", "ute", "truck_light", "car", "motorcycle", "bicycle"];
const FUEL_TYPES = ["petrol", "diesel", "hybrid", "electric", "none"];
const OWNERSHIPS = ["effy_owned", "driver_owned"];
const STATUSES: VehicleStatus[] = ["active", "off_road", "retired"];

/** ISO `YYYY-MM-DD`, or null. ⚠ Refuses anything else rather than letting PostgreSQL guess — a date
 *  the database interprets differently from the operator is a silent wrong answer. */
function assertDate(value: unknown, field: string): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError("the vehicle could not be saved", [
      { field, message: "must be a date in the form YYYY-MM-DD" },
    ]);
  }
}

function assertEnum(value: unknown, allowed: string[], field: string): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw validationError("the vehicle could not be saved", [
      { field, message: `must be one of ${allowed.join(", ")}` },
    ]);
  }
}

function assertBody(body: Partial<VehicleCreateRequest>, requirePresence: boolean): void {
  const fields: { field: string; message: string }[] = [];

  if (requirePresence) {
    for (const key of ["registrationPlate", "make", "model", "bodyType"] as const) {
      const v = body[key];
      if (typeof v !== "string" || v.trim() === "") {
        fields.push({ field: key, message: "is required" });
      }
    }
  }
  if (fields.length > 0) throw validationError("the vehicle could not be saved", fields);

  assertEnum(body.bodyType, BODY_TYPES, "bodyType");
  assertEnum(body.fuelType, FUEL_TYPES, "fuelType");
  assertEnum(body.ownership, OWNERSHIPS, "ownership");
  assertDate(body.registrationExpiresOn, "registrationExpiresOn");
  assertDate(body.insuranceExpiresOn, "insuranceExpiresOn");
  assertDate(body.roadworthyExpiresOn, "roadworthyExpiresOn");

  for (const key of ["payloadKg", "loadVolumeLitres", "crateCapacity", "odometerKm", "year"] as const) {
    const v = body[key];
    if (v === null || v === undefined) continue;
    if (typeof v !== "number" || !Number.isInteger(v)) {
      throw validationError("the vehicle could not be saved", [
        { field: key, message: "must be a whole number" },
      ]);
    }
  }
}

export async function createVehicle(
  body: VehicleCreateRequest,
  actorSub: string,
  scope: RequestScope,
): Promise<VehicleDetail> {
  assertBody(body, true);

  // ⚠ Checked here for a NAMED refusal; guaranteed by `vehicle_plate_active_uq` in the database, so
  // two operators racing cannot both succeed. The check is for the message, not for the invariant.
  const clash = await repo.plateInUse(body.registrationPlate);
  if (clash) {
    throw conflict(`a vehicle with plate ${clash} is already on the register`, [
      { field: "registrationPlate", message: `${clash} is already in use by another vehicle` },
    ]);
  }

  const id = await repo.insertVehicle(body as unknown as Record<string, unknown>);
  await recordAudit(
    { actorSub, action: "vehicle.created", targetType: "vehicle", driverId: id, detail: { registrationPlate: body.registrationPlate } },
  );
  const created = await repo.getVehicle(id);
  if (!created) throw notFound("vehicle not found");
  scope.log.info({ vehicleId: id }, "vehicle created");
  return created;
}

export async function updateVehicle(
  id: string,
  body: VehicleUpdateRequest,
  actorSub: string,
  scope: RequestScope,
): Promise<VehicleDetail> {
  if (!body?.updatedAt) {
    throw validationError("the vehicle could not be saved", [
      { field: "updatedAt", message: "is required — reload the vehicle and try again" },
    ]);
  }
  assertBody(body, false);

  if (typeof body.registrationPlate === "string") {
    const clash = await repo.plateInUse(body.registrationPlate, id);
    if (clash) {
      throw conflict(`a vehicle with plate ${clash} is already on the register`, [
        { field: "registrationPlate", message: `${clash} is already in use by another vehicle` },
      ]);
    }
  }

  const { updatedAt, ...patch } = body;
  const changed = Object.keys(patch);
  const outcome = await repo.updateVehicle(id, patch as Record<string, unknown>, updatedAt, async (tx, vehicleId) => {
    await recordAudit(
      { actorSub, action: "vehicle.updated", targetType: "vehicle", driverId: vehicleId, detail: { changed } },
      tx,
    );
  });

  if (outcome === "not_found") throw notFound("vehicle not found");
  if (outcome === "stale") {
    throw conflict(
      "this vehicle was changed by someone else while you were editing it. Reload and reapply your changes.",
    );
  }
  const fresh = await repo.getVehicle(id);
  if (!fresh) throw notFound("vehicle not found");
  scope.log.info({ vehicleId: id, changed }, "vehicle updated");
  return fresh;
}

export async function setVehicleStatus(
  id: string,
  body: VehicleStatusRequest,
  actorSub: string,
  scope: RequestScope,
): Promise<VehicleDetail> {
  if (!STATUSES.includes(body?.status)) {
    throw validationError("the status could not be changed", [
      { field: "status", message: `must be one of ${STATUSES.join(", ")}` },
    ]);
  }
  const reason = body.reason?.trim() ?? "";
  if (!reason) {
    throw validationError("the status could not be changed", [
      { field: "reason", message: "a reason is required, and is recorded against the vehicle" },
    ]);
  }

  const current = await repo.getVehicle(id);
  if (!current) throw notFound("vehicle not found");

  // ⚠ RETIRING A VEHICLE THAT IS STILL OUT WITH A DRIVER IS REFUSED, NOT SILENTLY ALLOWED.
  // The van is in a carpark somewhere. Retiring it would take it off the assignable fleet while a
  // person still physically has it, and nothing would say so — 056's stranded-work shape, which was
  // in no register because nobody knew. Take it back first; that is a real-world act, not a query.
  if (body.status === "retired" && current.currentHolderDriverId) {
    throw conflict(
      `${current.registrationPlate} is still out with ${current.currentHolderName}. Record its return before retiring it.`,
      [
        {
          field: "status",
          message: `held by ${current.currentHolderName} since the current holding began`,
        },
      ],
    );
  }

  const ok = await repo.setStatus(id, body.status, reason, async (tx, vehicleId) => {
    await recordAudit(
      {
        actorSub,
        action: "vehicle.status_changed",
        targetType: "vehicle",
        driverId: vehicleId,
        detail: { status: body.status, reason },
      },
      tx,
    );
  });
  if (!ok) throw notFound("vehicle not found");

  const fresh = await repo.getVehicle(id);
  if (!fresh) throw notFound("vehicle not found");
  scope.log.info({ vehicleId: id, status: body.status }, "vehicle status changed");
  return fresh;
}

export async function readVehicle(id: string): Promise<VehicleDetail> {
  const v = await repo.getVehicle(id);
  if (!v) throw notFound("vehicle not found");
  return v;
}
