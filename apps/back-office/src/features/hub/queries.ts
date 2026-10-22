import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import type { LabelReadDTO } from "@effy/shared-types";

import { getHubExpected, postHubCheckins } from "./repo";

// ⚠ Under the "dispatch" root on purpose: a live `dispatch` change already re-reads every key under it
// (features/live/routes.ts), so a driver's own check-in updates the station with no new mapping.
export const HUB_ROOT = ["dispatch", "hub"] as const;

export const hubExpectedQuery = () =>
  queryOptions({ queryKey: [...HUB_ROOT, "expected"] as const, queryFn: getHubExpected });

export function useHubCheckin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (read: Partial<LabelReadDTO>) => postHubCheckins([read]),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: HUB_ROOT }),
  });
}
