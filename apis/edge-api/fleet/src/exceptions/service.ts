// Delivery-exception use-cases (056 US3).
import type {
  DriverException,
  DriverExceptionKind,
  DriverExceptionListResponse,
} from "@effy/shared-types";

import { recordAudit } from "../shared/audit";
import { conflict, notFound, validationError } from "../shared/errors";
import * as repo from "./repository";

export async function listExceptions(
  params: repo.ExceptionListParams,
): Promise<DriverExceptionListResponse> {
  // Both reads are independent — the count is not derived from the page, because the page is
  // filtered and the count is not (FR-032 is "how many are outstanding", not "how many are shown").
  const [page, outstanding] = await Promise.all([
    repo.listExceptions(params),
    repo.outstandingCount(),
  ]);
  return { items: page.items, nextCursor: page.nextCursor, outstandingCount: outstanding };
}

/** Resolve one exception with a note (FR-031). */
export async function resolveException(
  kind: DriverExceptionKind,
  id: string,
  note: string,
  actorSub: string,
): Promise<DriverException> {
  const trimmed = note?.trim() ?? "";
  if (!trimmed) {
    throw validationError("the exception could not be resolved", [
      // ⚠ A note is required, not optional. "Resolved" with no note records that someone clicked a
      // button, which is worse than leaving it open — it removes the item from the queue and the
      // reason for removing it in one action.
      { field: "note", message: "say what was done about it; this is kept permanently" },
    ]);
  }

  const outcome = await repo.resolveException(kind, id, actorSub, trimmed);
  if (outcome === "not_found") throw notFound("exception not found");
  if (outcome === "already_resolved") {
    throw conflict("this exception has already been resolved by someone else");
  }

  const item = await repo.getException(kind, id);
  if (!item) throw notFound("exception not found");

  await recordAudit({
    actorSub,
    action: "driver.exception_resolved",
    driverId: item.driverId,
    detail: { changed: ["resolvedAt"], values: { kind, exceptionId: id } },
  });
  return item;
}
