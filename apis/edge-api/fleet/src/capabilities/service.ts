// Driver clearance use-cases (062). The access decision lives in the handler's guard; this layer owns
// the domain rules and the refusals.

import type { RequestScope } from "@effy/edge-shared";
import type { DriverCapability, GrantCapabilityRequest } from "@effy/shared-types";

import * as driverRepo from "../drivers/repository";
import { recordAudit } from "../shared/audit";
import { notFound, validationError } from "../shared/errors";
import * as repo from "./repository";
import { CAPABILITY_FUNCTIONS, CAPABILITY_METHODS } from "./sql";

export async function listCapabilities(driverId: string): Promise<DriverCapability[]> {
  const driver = await driverRepo.getDriver(driverId);
  if (!driver) throw notFound("driver not found");
  return repo.listForDriver(driverId);
}

/**
 * Grant one clearance.
 *
 * ⚠ GRANTING A CLEARANCE THE DRIVER ALREADY HOLDS IS A SUCCESS, NOT A CONFLICT (FR-005). Two
 * operators doing it at the same moment both succeed, and the outcome is correct either way. A 409
 * here would be a refusal with nothing to fix — and would make the console show an error for an
 * action that achieved exactly what the operator wanted.
 */
export async function grantCapability(
  driverId: string,
  body: GrantCapabilityRequest,
  actorSub: string,
  scope: RequestScope,
): Promise<DriverCapability[]> {
  const driver = await driverRepo.getDriver(driverId);
  if (!driver) throw notFound("driver not found");

  const fields: { field: string; message: string }[] = [];
  if (!CAPABILITY_FUNCTIONS.includes(body?.function as never)) {
    fields.push({ field: "function", message: `must be one of ${CAPABILITY_FUNCTIONS.join(", ")}` });
  }
  if (!CAPABILITY_METHODS.includes(body?.method as never)) {
    fields.push({ field: "method", message: `must be one of ${CAPABILITY_METHODS.join(", ")}` });
  }
  // ⚠ `zoneId` must be PRESENT, and may be explicitly null. A key absent and a key present-with-null
  // must not be conflated, or "every zone" becomes indistinguishable from "the operator forgot to
  // choose" — and the platform would silently grant the broadest possible clearance by accident.
  if (!(body && "zoneId" in body)) {
    fields.push({
      field: "zoneId",
      message: "is required — send a zone id, or null to mean every zone",
    });
  }
  if (fields.length > 0) throw validationError("the clearance could not be granted", fields);

  if (body.zoneId !== null) {
    const zone = await repo.findZone(body.zoneId);
    if (!zone) {
      throw validationError("the clearance could not be granted", [
        { field: "zoneId", message: "that zone does not exist" },
      ]);
    }
    // ⚠ A disabled zone is refused at GRANT time, because clearing somebody for an area the platform
    // does not currently serve is almost always a mistake. Existing clearances for a zone that is
    // later disabled are NOT deleted — disable is reversible, and re-enabling must restore cover
    // without anybody re-granting by hand.
    if (zone.status !== "active") {
      throw validationError("the clearance could not be granted", [
        { field: "zoneId", message: `${zone.name} is disabled and is not currently served` },
      ]);
    }
  }

  await repo.grant(driverId, body.function, body.method, body.zoneId, actorSub);
  await recordAudit({
    actorSub,
    action: "driver.capability_granted",
    driverId,
    detail: { function: body.function, method: body.method, zoneId: body.zoneId ?? "every_zone" },
  });
  scope.log.info({ driverId, function: body.function, method: body.method }, "capability granted");
  return repo.listForDriver(driverId);
}

/**
 * Revoke one clearance.
 *
 * ⚠ REVOKING A CLEARANCE THE DRIVER DOES NOT HOLD IS A SUCCESS, NOT A 404 (FR-006). The operator's
 * intent — "this driver should not be cleared for that" — is already true. Erroring would make two
 * operators tidying the same record fight each other.
 */
export async function revokeCapability(
  driverId: string,
  capabilityId: string,
  actorSub: string,
  scope: RequestScope,
): Promise<DriverCapability[]> {
  const driver = await driverRepo.getDriver(driverId);
  if (!driver) throw notFound("driver not found");

  const removed = await repo.revoke(driverId, capabilityId);
  if (removed) {
    await recordAudit({
      actorSub,
      action: "driver.capability_revoked",
      driverId,
      detail: { capabilityId },
    });
    scope.log.info({ driverId, capabilityId }, "capability revoked");
  }
  return repo.listForDriver(driverId);
}
