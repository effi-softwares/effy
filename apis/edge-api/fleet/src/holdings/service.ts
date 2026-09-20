// Vehicle holding use-cases (061) — issuing a vehicle to a driver and taking it back.
//
// ⚠ EVERY REFUSAL NAMES WHAT IS ALREADY HELD (FR-014). "This vehicle is unavailable" sends an
// operator to look for a problem; "EFY-001 is out with Sam Rivers" sends them to Sam. 053 shipped a
// console where every refusal collapsed into one generic sentence because the screen tested
// `e instanceof Error` while the client throws a plain object — the server got it right and the UI
// discarded it. The `fields` list is what survives to the screen, so it is populated deliberately.

import type { RequestScope } from "@effy/edge-shared";
import type { HoldingIssueRequest, HoldingReturnRequest, VehicleDetail } from "@effy/shared-types";

import * as driverRepo from "../drivers/repository";
import { recordAudit } from "../shared/audit";
import { conflict, notFound, validationError } from "../shared/errors";
import * as vehicleRepo from "../vehicles/repository";
import { ISSUABLE_STATUS } from "../vehicles/sql";
import * as repo from "./repository";
import { HoldingConflictError, OdometerError } from "./repository";

function assertOdometer(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw validationError("the odometer reading could not be recorded", [
      { field, message: "must be a whole number of kilometres, zero or more" },
    ]);
  }
  return value;
}

export async function issueVehicle(
  vehicleId: string,
  body: HoldingIssueRequest,
  actorSub: string,
  scope: RequestScope,
): Promise<VehicleDetail> {
  if (!body?.driverId) {
    throw validationError("the vehicle could not be issued", [
      { field: "driverId", message: "is required" },
    ]);
  }
  const odometerStartKm = assertOdometer(body.odometerStartKm, "odometerStartKm");

  const vehicle = await vehicleRepo.getVehicle(vehicleId);
  if (!vehicle) throw notFound("vehicle not found");

  // ⚠ Retired and off-road are refused SEPARATELY. They mean different things and have different
  // remedies — one is terminal, the other is "it is in the workshop, try tomorrow" — and collapsing
  // them into "unavailable" would tell an operator nothing about what to do next.
  if (vehicle.status === "retired") {
    throw conflict(`${vehicle.registrationPlate} is retired and can no longer be issued`, [
      { field: "status", message: "this vehicle has been retired" },
    ]);
  }
  if (vehicle.status !== ISSUABLE_STATUS) {
    throw conflict(`${vehicle.registrationPlate} is off the road and cannot be issued`, [
      { field: "status", message: vehicle.statusReason ?? "this vehicle is off the road" },
    ]);
  }

  const driver = await driverRepo.getDriver(body.driverId);
  if (!driver) throw notFound("driver not found");
  if (driver.status !== "active") {
    throw conflict(`${driver.name} is ${driver.status} and cannot be given a vehicle`, [
      { field: "driverId", message: `this driver's employment status is ${driver.status}` },
    ]);
  }

  try {
    await repo.issue(
      { vehicleId, driverId: body.driverId, odometerStartKm, note: body.note ?? null, issuedBySub: actorSub },
      async (tx, holdingId) => {
        await recordAudit(
          {
            actorSub,
            action: "vehicle.holding_issued",
            targetType: "vehicle",
            driverId: vehicleId,
            detail: { holdingId, driverId: body.driverId, odometerStartKm },
          },
          tx,
        );
      },
    );
  } catch (err) {
    if (err instanceof HoldingConflictError) await nameTheClash(err, vehicleId, body.driverId);
    throw err;
  }

  scope.log.info({ vehicleId, driverId: body.driverId }, "vehicle issued");
  return (await vehicleRepo.getVehicle(vehicleId))!;
}

/**
 * Turn a unique-index violation into a refusal that names the obstacle.
 *
 * ⚠ The index tells us WHICH rule was broken; this read tells us WHO or WHAT broke it. The read
 * happens AFTER the failure, so it can never be the thing that decides — which is what keeps the
 * guarantee in the database where two concurrent operators cannot slip past it.
 */
async function nameTheClash(err: HoldingConflictError, vehicleId: string, driverId: string): Promise<never> {
  if (err.clash === "vehicle") {
    const holder = await repo.holderOf(vehicleId);
    throw conflict(
      holder
        ? `that vehicle is already out with ${holder.driverName}. Record its return before issuing it again.`
        : "that vehicle is already out with another driver.",
      [{ field: "vehicleId", message: holder ? `currently held by ${holder.driverName}` : "already held" }],
    );
  }
  if (err.clash === "driver") {
    const held = await repo.heldByDriver(driverId);
    throw conflict(
      held
        ? `that driver already has ${held.registrationPlate} (${held.make} ${held.model}). Record its return first.`
        : "that driver already has a vehicle.",
      [{ field: "driverId", message: held ? `currently holding ${held.registrationPlate}` : "already holding a vehicle" }],
    );
  }
  throw conflict("that vehicle could not be issued because it conflicts with an existing holding.");
}

export async function returnVehicle(
  vehicleId: string,
  body: HoldingReturnRequest,
  actorSub: string,
  scope: RequestScope,
): Promise<VehicleDetail> {
  const odometerEndKm = assertOdometer(body?.odometerEndKm, "odometerEndKm");

  const vehicle = await vehicleRepo.getVehicle(vehicleId);
  if (!vehicle) throw notFound("vehicle not found");

  let outcome: repo.ReturnOutcome;
  try {
    outcome = await repo.returnCurrent(vehicleId, odometerEndKm, body?.note ?? null, actorSub, async (tx, holdingId) => {
      await recordAudit(
        {
          actorSub,
          action: "vehicle.holding_returned",
          targetType: "vehicle",
          driverId: vehicleId,
          detail: { holdingId, odometerEndKm },
        },
        tx,
      );
    });
  } catch (err) {
    // ⚠ FR-018 is enforced by the schema's CHECK, not by this service. A closing reading below the
    // opening one is physically impossible, so the rule holds for every writer — including one
    // nobody has written yet.
    if (err instanceof OdometerError) {
      throw validationError("the vehicle could not be returned", [
        {
          field: "odometerEndKm",
          message: "the closing reading is below the reading recorded when the vehicle went out",
        },
      ]);
    }
    throw err;
  }

  if (outcome === "not_held") {
    throw conflict(`${vehicle.registrationPlate} is not currently out with anybody.`, [
      { field: "vehicleId", message: "this vehicle has no open holding to return" },
    ]);
  }

  scope.log.info({ vehicleId }, "vehicle returned");
  return (await vehicleRepo.getVehicle(vehicleId))!;
}
