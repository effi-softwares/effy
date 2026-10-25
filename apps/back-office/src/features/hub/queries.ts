import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { LabelReadDTO } from "@effy/shared-types"

import { getHubExpected, postHubCheckins } from "./repo"

const HUB_ROOT = ["dispatch", "hub"] as const

export const hubExpectedQuery = () =>
  queryOptions({ queryKey: [...HUB_ROOT, "expected"] as const, queryFn: getHubExpected })

export function useHubCheckin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (read: Partial<LabelReadDTO>) => postHubCheckins([read]),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: HUB_ROOT }),
  })
}
