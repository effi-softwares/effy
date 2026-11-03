import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type { ConsoleTourPatch, ConsoleTourStateDTO } from "@effy/shared-types";

import { applyPatch } from "./engine";

/**
 * A person's tour state, for any console (106 research R14): the app supplies only the two fetch functions; the
 * query, the optimistic write and its survival across a reload while offline live here once.
 */

export const TOUR_STATE_KEY = ["tours", "me"] as const;
export const TOUR_WRITE_KEY = ["tours", "write"] as const;

export interface TourStateFetchers {
  load: () => Promise<ConsoleTourStateDTO>;
  save: (patch: ConsoleTourPatch) => Promise<ConsoleTourStateDTO>;
}

export function tourStateQueries({ load, save }: TourStateFetchers) {
  const stateQuery = queryOptions({
    queryKey: TOUR_STATE_KEY,
    queryFn: load,
    // Only this person changes it, and every write answers with the new state.
    staleTime: Infinity,
    retry: 1,
  });

  function useTourWrite() {
    const qc = useQueryClient();
    return useMutation({
      mutationKey: TOUR_WRITE_KEY,
      mutationFn: save,
      onMutate: async (patch: ConsoleTourPatch) => {
        await qc.cancelQueries({ queryKey: TOUR_STATE_KEY });
        const before = qc.getQueryData<ConsoleTourStateDTO>(TOUR_STATE_KEY);
        if (before) qc.setQueryData(TOUR_STATE_KEY, applyPatch(before, patch));
        return { before };
      },
      onError: (_err, _patch, context) => {
        if (context?.before) qc.setQueryData(TOUR_STATE_KEY, context.before);
      },
      onSuccess: (state) => {
        qc.setQueryData(TOUR_STATE_KEY, state);
      },
    });
  }

  /**
   * Call before the query cache is restored: a write paused offline is saved with the cache and needs its function
   * back to run after a reload (then call `queryClient.resumePausedMutations()` once the restore has finished).
   */
  function registerTourMutationDefaults(queryClient: QueryClient): void {
    queryClient.setMutationDefaults(TOUR_WRITE_KEY, {
      mutationFn: (patch: ConsoleTourPatch) => save(patch),
      onSuccess: (state: ConsoleTourStateDTO) => queryClient.setQueryData(TOUR_STATE_KEY, state),
    });
  }

  return { stateQuery, useTourWrite, registerTourMutationDefaults };
}
