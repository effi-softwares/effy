import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { ReassignRoundInput, ReorderStopsInput } from "@effy/shared-types"

import * as repo from "./repo"

export const dispatchKeys = {
  all: ["dispatch"] as const,
  day: () => ["dispatch", "day"] as const,
  round: (id: string) => ["dispatch", "round", id] as const,
  windows: (date: string | null) => ["dispatch", "windows", date ?? "today"] as const,
}

export const dispatchWindowsQuery = (date: string | null) =>
  queryOptions({ queryKey: dispatchKeys.windows(date), queryFn: () => repo.getWindows(date) })

export const dispatchDayQuery = () => queryOptions({ queryKey: dispatchKeys.day(), queryFn: repo.getDay })

export const dispatchRoundQuery = (id: string) =>
  queryOptions({ queryKey: dispatchKeys.round(id), queryFn: () => repo.getRound(id) })

function useDispatchMutation<TVars>(fn: (v: TVars) => Promise<void>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dispatchKeys.all })
    },
  })
}

export const useReassignRound = (id: string) =>
  useDispatchMutation<ReassignRoundInput>((body) => repo.reassign(id, body))

export const useUnassignRound = (id: string) =>
  useDispatchMutation<string>((expectedUpdatedAt) => repo.unassign(id, expectedUpdatedAt))

export const useReorderStops = (id: string) => useDispatchMutation<ReorderStopsInput>((body) => repo.reorder(id, body))

export const useWaiveSequence = (id: string) =>
  useDispatchMutation<string>(async (reason) => {
    await repo.waiveSequence(id, reason)
  })
