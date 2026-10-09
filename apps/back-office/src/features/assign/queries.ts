import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { isDomainError } from "@effy/api-client";

import { assignTo, driversFor, unassign, type Stage } from "./repo";

export const assignKeys = {
  drivers: (packageId: string, stage: Stage) => ["dispatch", "drivers-for", packageId, stage] as const,
};

export const driversForQuery = (packageId: string, stage: Stage) =>
  queryOptions({ queryKey: assignKeys.drivers(packageId, stage), queryFn: () => driversFor(packageId, stage) });

/** After any change, the order and dispatch screens re-read; the live channel tells everyone else. */
function useRefresh() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["orders"] }),
      qc.invalidateQueries({ queryKey: ["dispatch"] }),
    ]);
  };
}

export function useAssignTo(packageId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: Parameters<typeof assignTo>[1]) => assignTo(packageId, body),
    onSettled: refresh,
  });
}

export function useUnassign(packageId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: Parameters<typeof unassign>[1]) => unassign(packageId, body),
    onSettled: refresh,
  });
}

/** The refusals fleet writes for a PERSON to read, in one line (073 FR-017). */
const OWN_WORDS = new Set(["cannot_take", "needs_confirm", "changed", "collected", "not_needed", "not_yet"]);

/**
 * One line for a failed action. ⚠ Only the assignment routes' own refusals are shown as the server
 * wrote them — those are written as staff copy. Anything else gets a plain generic line (the api
 * client's rule: never show an arbitrary server `detail`).
 */
export function assignErrorLine(err: unknown): { line: string; needsConfirm: boolean } {
  if (isDomainError(err) && err.type && OWN_WORDS.has(err.type) && err.detail) {
    return { line: err.detail, needsConfirm: err.type === "needs_confirm" };
  }
  if (isDomainError(err) && err.kind === "forbidden") return { line: "Only a manager or admin can change a driver.", needsConfirm: false };
  return { line: "That didn't work. Try again in a moment.", needsConfirm: false };
}
