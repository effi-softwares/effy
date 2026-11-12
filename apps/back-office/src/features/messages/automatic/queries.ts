import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { AutomationDraft, AutomationStateChange, AutomationUpdate } from "@effy/shared-types"

import { MESSAGES_ROOT } from "../queries"
import { changeAutomationState, createAutomation, getAutomation, updateAutomation } from "./repo"

/** Under the messages root, so the live kind `messages` re-reads automatic messages too. */
export const AUTOMATIONS_ROOT = [...MESSAGES_ROOT, "automatic"] as const

export const automationQuery = (id: string) =>
  queryOptions({ queryKey: [...AUTOMATIONS_ROOT, "detail", id] as const, queryFn: () => getAutomation(id) })

function useInvalidating<A, R>(fn: (a: A) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({ mutationFn: fn, onSuccess: () => void queryClient.invalidateQueries({ queryKey: MESSAGES_ROOT }) })
}

export const useCreateAutomation = () => useInvalidating((body: AutomationDraft) => createAutomation(body))
export const useUpdateAutomation = (id: string) => useInvalidating((body: AutomationUpdate) => updateAutomation(id, body))
export const useAutomationState = (id: string) => useInvalidating((body: AutomationStateChange) => changeAutomationState(id, body))
