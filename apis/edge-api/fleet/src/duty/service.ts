// Duty use-cases (056 US4).
import type { DutyResponseAdmin } from "@effy/shared-types";

import { recordAudit } from "../shared/audit";
import { conflict, notFound } from "../shared/errors";
import * as repo from "./repository";

export async function readDuty(): Promise<DutyResponseAdmin> {
  const [onDuty, unassigned] = await Promise.all([repo.listOnDuty(), repo.unassignedWork()]);
  return { onDuty, unassigned };
}

export async function endDutySession(sessionId: string, actorSub: string): Promise<void> {
  const outcome = await repo.endSession(sessionId, async (tx, driverId) => {
    await recordAudit(
      {
        actorSub,
        action: "driver.duty_session_ended",
        driverId,
        detail: { changed: ["dutySession"], values: { sessionId } },
      },
      tx,
    );
  });
  if (outcome === "not_found") throw notFound("duty session not found");
  if (outcome === "already_ended") throw conflict("this duty session has already ended");
}
