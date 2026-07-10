import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { track } from "@/lib/telemetry";

import { loadSession, signOutUser } from "./repo";

// The session is a QUERY — one cached source of truth for "who am I / am I signed in". Mutations
// (sign-in/out) invalidate it; it is never hand-cached in component state (Principle VI).
export const sessionQuery = queryOptions({
  queryKey: ["auth", "session"] as const,
  queryFn: loadSession,
  staleTime: 60_000,
});

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signOutUser,
    onSuccess: async () => {
      track({ name: "shop_auth_signed_out" });
      // Drop every cached read, not just the session: the next operator to sign in on this browser
      // must not see the previous one's staff record for a frame.
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
      queryClient.removeQueries({ queryKey: ["store"] });
    },
  });
}
