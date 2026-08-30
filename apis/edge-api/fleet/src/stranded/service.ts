// Stranded-work use-cases (056 US4, FR-021).
import type { StrandedReleaseResponse, StrandedWorkResponse } from "@effy/shared-types";
import type { RequestScope } from "@effy/edge-shared";

import { recordAudit } from "../shared/audit";
import { validationError } from "../shared/errors";
import * as repo from "./repository";

export async function listStranded(): Promise<StrandedWorkResponse> {
  return { items: await repo.listStranded() };
}

export async function releaseStranded(
  collectionTaskIds: string[],
  deliveryTaskIds: string[],
  note: string,
  actorSub: string,
  scope: RequestScope,
): Promise<StrandedReleaseResponse> {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) {
    throw validationError("the work could not be released", [
      // ⚠ Required for the same reason the exception note is: releasing asserts the goods are
      // accounted for. An unexplained release is a claim about the physical world with nobody's name
      // against the reasoning.
      { field: "note", message: "say where the goods are; this is kept permanently" },
    ]);
  }
  if (collectionTaskIds.length === 0 && deliveryTaskIds.length === 0) {
    throw validationError("the work could not be released", [
      { field: "taskIds", message: "select at least one item to release" },
    ]);
  }

  const released = await repo.releaseStranded(collectionTaskIds, deliveryTaskIds);

  await recordAudit({
    actorSub,
    action: "driver.work_released",
    driverId: null,
    detail: {
      changed: ["strandedWork"],
      values: { released, collectionTaskIds, deliveryTaskIds, note: trimmed },
    },
  });
  scope.log.info({ released }, "fleet.stranded_work_released");
  return { released };
}
