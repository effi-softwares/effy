import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { ExceptionOutcome } from "@effy/shared-types"

import { dispatchKeys } from "@/features/dispatch/queries"

import * as repo from "./repo"

const exceptionKeys = {
  all: ["exceptions"] as const,
  list: (includeResolved: boolean) => ["exceptions", "list", includeResolved] as const,
}

export const exceptionsQuery = (includeResolved: boolean) =>
  queryOptions({
    queryKey: exceptionKeys.list(includeResolved),
    queryFn: () => repo.listExceptions(includeResolved),
  })

export function useResolveException() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      note,
      outcome = null,
    }: {
      id: string
      note: string | null
      outcome?: ExceptionOutcome | null
    }) => repo.resolveException(id, note, outcome),
    onSuccess: () => void qc.invalidateQueries({ queryKey: exceptionKeys.all }),
  })
}

export function useRecordReturn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ roundId, changeId }: { roundId: string; changeId: string }) => repo.recordReturn(roundId, changeId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exceptionKeys.all })
      void qc.invalidateQueries({ queryKey: dispatchKeys.all })
    },
  })
}

export function useResolveHold() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ holdId, resolution }: { holdId: string; resolution: "found" | "lost" }) =>
      repo.resolveHold(holdId, resolution),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exceptionKeys.all })
      void qc.invalidateQueries({ queryKey: dispatchKeys.all })
    },
  })
}

export function useClearVehicleCheck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ checkId, note }: { checkId: string; note: string }) => repo.clearVehicleCheck(checkId, note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exceptionKeys.all })
      void qc.invalidateQueries({ queryKey: dispatchKeys.all })
    },
  })
}
