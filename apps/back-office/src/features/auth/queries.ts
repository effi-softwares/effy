import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { loadSession, signOutUser } from "./repo";

// The session is a QUERY — one cached source of truth for "who am I / am I signed in"
// (plan mechanic 1). Mutations (sign-in/out) invalidate it; never hand-cache it in component state.
export const sessionQuery = queryOptions({
  queryKey: ["auth", "session"] as const,
  queryFn: loadSession,
  staleTime: 60_000,
});

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOutUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey }),
  });
}
