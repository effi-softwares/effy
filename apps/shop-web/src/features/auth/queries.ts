import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import { track } from "@/lib/telemetry"

import { clearPersistedQueries } from "@/lib/query-persist"
import { forgetToken, obtainToken } from "@/features/notifications/messaging"
import { unregisterDevice } from "@/features/notifications/api"

import { loadSession, signOutUser } from "./repo"

export const sessionQuery = queryOptions({
  queryKey: ["auth", "session"] as const,
  queryFn: loadSession,
  staleTime: 60_000,
})

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      try {
        const token = await obtainToken()
        if (token) {
          await unregisterDevice(token)
          await forgetToken()
        }
      } catch {}
      return signOutUser()
    },
    onSuccess: async () => {
      track({ name: "shop_auth_signed_out" })
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
      queryClient.removeQueries({ queryKey: ["shop"] })
      await clearPersistedQueries()
    },
  })
}
