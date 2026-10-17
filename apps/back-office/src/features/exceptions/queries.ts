import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { dispatchKeys } from "@/features/dispatch/queries";

import * as repo from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Mutations INVALIDATE.

export const exceptionKeys = {
  all: ["exceptions"] as const,
  list: (includeResolved: boolean) => ["exceptions", "list", includeResolved] as const,
};

export const exceptionsQuery = (includeResolved: boolean) =>
  queryOptions({
    queryKey: exceptionKeys.list(includeResolved),
    queryFn: () => repo.listExceptions(includeResolved),
  });

/**
 * ⚠ INVALIDATES BOTH LISTS. Resolving moves a row from the open list to the resolved one, so patching
 * only the list currently on screen would leave the other showing an exception in the wrong state —
 * and this is a screen two people may be triaging from at once.
 */
export function useResolveException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string | null }) => repo.resolveException(id, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: exceptionKeys.all }),
  });
}

/** 088 — record a return on a driver's behalf; the list, and dispatch's counts, change. */
export function useRecordReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roundId, changeId }: { roundId: string; changeId: string }) => repo.recordReturn(roundId, changeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exceptionKeys.all });
      void qc.invalidateQueries({ queryKey: dispatchKeys.all });
    },
  });
}

/** 093 — a held package decided; the lists, and dispatch's day, change. */
export function useResolveHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ holdId, resolution }: { holdId: string; resolution: "found" | "lost" }) => repo.resolveHold(holdId, resolution),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exceptionKeys.all });
      void qc.invalidateQueries({ queryKey: dispatchKeys.all });
    },
  });
}

/** 093 — an unsafe vehicle check cleared; the driver can be given work again. */
export function useClearVehicleCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ checkId, note }: { checkId: string; note: string }) => repo.clearVehicleCheck(checkId, note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exceptionKeys.all });
      void qc.invalidateQueries({ queryKey: dispatchKeys.all });
    },
  });
}
