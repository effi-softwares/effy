import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query"

import { loadSession, signOutUser } from "./repo"

export const sessionQuery = queryOptions({
  queryKey: ["auth", "session"] as const,
  queryFn: loadSession,
  staleTime: 60_000,
})

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: signOutUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey }),
  })
}
