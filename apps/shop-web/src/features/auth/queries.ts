import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import { track } from "@/lib/telemetry";

import { clearPersistedQueries } from "@/lib/query-persist";
import { forgetToken } from "@/features/notifications/messaging";
import { unregisterDevice } from "@/features/notifications/api";
import { obtainToken } from "@/features/notifications/messaging";

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
    mutationFn: async () => {
      // ⚠ 059 FR-027 — UNREGISTER BEFORE THE SESSION CLEARS, because the DELETE needs the very
      // credential signing out is about to destroy. Afterwards the call would 401 and this device
      // would keep receiving this shop's notifications for a shop the operator has left.
      //
      // ⚠ BEST EFFORT, NEVER BLOCKING. If it fails, signing out still proceeds — the row is cleaned
      // up by the worker's existing dead-token pruning on the next send. A notification setting must
      // not be able to trap an operator in a session.
      //
      // ⚠ BOTH SIDES, OR NEITHER — AND THIS ORDER. `forgetToken()` calls Firebase's `deleteToken()`,
      // which unsubscribes the browser and KILLS THE TOKEN AT FCM. Calling it unconditionally (the
      // first version of this) meant that whenever `obtainToken()` returned null — a fresh load
      // where the service-worker registration had not resolved yet — the server DELETE was skipped
      // but the token was destroyed anyway. The row then pointed at a token FCM considered dead, the
      // next order's send was rejected, and the worker pruned the registration.
      //
      // The operator saw: notifications enabled successfully, then silently never again. Diagnosed
      // from a `pruned: 1` counter, because nothing logged the reason.
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
      // ⚠ 059 — and the PERSISTED copy of those reads too. It holds one shop's operational data on
      // what is often a shared shop tablet; invalidating the in-memory cache while leaving the
      // IndexedDB one intact would leave the previous operator's orders readable after sign-out.
      await clearPersistedQueries();
    },
  });
}
