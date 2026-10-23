import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { track } from "@/lib/telemetry";

import { clearPersistedQueries } from "@/lib/query-persist";
import { forgetToken } from "@/features/notifications/messaging";
import { unregisterDevice } from "@/features/notifications/api";
import { obtainToken } from "@/features/notifications/messaging";

import { loadSession, signOutUser } from "./repo";

// The session is a query — one cached source of truth for "who am I / am I signed in". Mutations
// (sign-in/out) invalidate it; it is never hand-cached in component state (Principle VI).
export const sessionQuery = queryOptions({
  queryKey: ["auth", "session"] as const,
  queryFn: loadSession,
  staleTime: 60_000,
});

export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Unregister before the session clears: the DELETE needs the credential sign-out destroys.
      // Best effort and never blocking (a dead row is pruned on the next send). Both sides or neither:
      // `forgetToken` kills the token at FCM, so destroying it while the server DELETE was skipped (no
      // token yet obtained) would leave the row pointing at a dead token, and notifications would
      // silently stop.
      try {
        const token = await obtainToken();
        if (token) {
          await unregisterDevice(token);
          await forgetToken();
        }
        // No token in hand → leave the subscription alone. A live row pointing at a live token is
        // recoverable (the next sign-in re-registers the same token); a live row pointing at a dead
        // one is not.
      } catch {
        /* see above */
      }
      return signOutUser();
    },
    onSuccess: async () => {
      track({ name: "shop_auth_signed_out" });
      // Drop every cached read, not just the session: the next operator to sign in on this browser
      // must not see the previous one's staff record for a frame.
      await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey });
      queryClient.removeQueries({ queryKey: ["shop"] });
      // And the persisted copy of those reads too. It holds one shop's operational data on
      // what is often a shared shop tablet; invalidating the in-memory cache while leaving the
      // IndexedDB one intact would leave the previous operator's orders readable after sign-out.
      await clearPersistedQueries();
    },
  });
}
