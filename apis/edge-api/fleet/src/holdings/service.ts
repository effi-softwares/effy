// Every refusal names what is already held ("EFY-001 is out with Sam Rivers"), carried in `fields`.

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

  // Retired and off-road are refused separately: terminal versus "in the workshop".
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

/** The index says which rule broke; this read, after the failure, says who or what. */
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
    // The odometer rule is the schema's check, so it holds for every writer.
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
