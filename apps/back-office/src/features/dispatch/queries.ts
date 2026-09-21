import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { ReassignRoundInput, ReorderStopsInput } from "@effy/shared-types";

import * as repo from "./repo";

// Server state lives ONLY in the TanStack Query cache (Principle VI). Mutations INVALIDATE.

export const dispatchKeys = {
  all: ["dispatch"] as const,
  day: () => ["dispatch", "day"] as const,
  round: (id: string) => ["dispatch", "round", id] as const,
};

export const dispatchDayQuery = () =>
  queryOptions({ queryKey: dispatchKeys.day(), queryFn: repo.getDay });

export const dispatchRoundQuery = (id: string) =>
  queryOptions({ queryKey: dispatchKeys.round(id), queryFn: () => repo.getRound(id) });

/**
 * ⚠ EVERY MUTATION INVALIDATES THE DAY. A dispatcher's change moves work between drivers, so the
 * round they did not touch is stale too — patching one row in the cache would leave the other
 * showing a driver who no longer holds it.
 */
function useDispatchMutation<TVars>(fn: (v: TVars) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchKeys.all });
    },
  });
}

export const useReassignRound = (id: string) =>
  useDispatchMutation<ReassignRoundInput>((body) => repo.reassign(id, body));

export const useUnassignRound = (id: string) =>
  useDispatchMutation<string>((expectedUpdatedAt) => repo.unassign(id, expectedUpdatedAt));

export const useReorderStops = (id: string) =>
  useDispatchMutation<ReorderStopsInput>((body) => repo.reorder(id, body));

export const useLockRound = (id: string) =>
  useDispatchMutation<string>((expectedUpdatedAt) => repo.lock(id, expectedUpdatedAt));

export const useUnlockRound = (id: string) =>
  useDispatchMutation<string>((expectedUpdatedAt) => repo.unlock(id, expectedUpdatedAt));
