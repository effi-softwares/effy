import type { RequestScope } from "@effy/edge-shared";
import type { DriverCapability, GrantCapabilityRequest } from "@effy/shared-types";

import * as driverRepo from "../drivers/repository";
import { recordAudit } from "../shared/audit";
import { notFound, validationError } from "../shared/errors";
import * as repo from "./repository";

const CAPABILITY_FUNCTIONS = ["collection", "delivery"] as const;

export async function listCapabilities(driverId: string): Promise<DriverCapability[]> {
  const driver = await driverRepo.getDriver(driverId);
  if (!driver) throw notFound("driver not found");
  return repo.listForDriver(driverId);
}

/** A clearance already held is a success, not a conflict. */
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
  // `zoneId` must be present and may be null: absent and null must not be conflated, or "every zone" is granted by accident.
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
    // A disabled zone is refused at grant time; existing clearances survive a disable so re-enabling restores cover.
    if (zone.status !== "active") {
      throw validationError("the clearance could not be granted", [
        { field: "zoneId", message: `${zone.name} is disabled and is not currently served` },
      ]);
    }
  }

  await repo.grant(driverId, body.function, body.zoneId, actorSub);
  await recordAudit({
    actorSub,
    action: "driver.capability_granted",
    driverId,
    detail: { function: body.function, zoneId: body.zoneId ?? "every_zone" },
  });
  scope.log.info({ driverId, function: body.function }, "capability granted");
  return repo.listForDriver(driverId);
}

/** Revoking one not held is a success, not a 404. */
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
