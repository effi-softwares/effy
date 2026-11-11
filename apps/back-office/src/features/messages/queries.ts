import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import type { MessageCreateRequest, MessageSendRequest, MessageUpdateRequest } from "@effy/shared-types"

import {
  cancelMessage,
  createMessage,
  getMessage,
  sendMessage,
  stopMessage,
  updateMessage,
  withdrawMessage,
} from "./repo"

/** Every messages query starts here; the live kind `messages` re-reads it (features/live/routes.ts). */
export const MESSAGES_ROOT = ["back-office", "messages"] as const

export const messageQuery = (id: string) =>
  queryOptions({ queryKey: [...MESSAGES_ROOT, "detail", id] as const, queryFn: () => getMessage(id) })

function useInvalidating<A, R>(fn: (a: A) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: MESSAGES_ROOT }),
  })
}

export const useCreateMessage = () => useInvalidating((body: MessageCreateRequest) => createMessage(body))
export const useUpdateMessage = (id: string) => useInvalidating((body: MessageUpdateRequest) => updateMessage(id, body))
export const useSendMessage = (id: string) => useInvalidating((body: MessageSendRequest) => sendMessage(id, body))
export const useMessageAction = (id: string) =>
  useInvalidating(({ action, version }: { action: "cancel" | "stop" | "withdraw"; version: number }) =>
    (action === "cancel" ? cancelMessage : action === "stop" ? stopMessage : withdrawMessage)(id, { version }),
  )
