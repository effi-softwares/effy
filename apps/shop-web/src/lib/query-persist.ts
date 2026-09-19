import { persistQueryClient } from "@tanstack/query-persist-client-core"
import type { PersistedClient, Persister } from "@tanstack/query-persist-client-core"
import type { QueryClient } from "@tanstack/react-query"
import { del, get, set } from "idb-keyval"

/**
 * Persist the server-state cache, so the console has something to show when it opens offline
 * (059, US5 / FR-035).
 *
 * ⚠ THIS IS THE EXISTING QUERY CACHE REHYDRATED, NOT A SECOND CACHE. TanStack Query remains the one
 * source of truth for server state (Principle VI); all this does is let that cache survive a reload.
 * The alternative — runtime-caching API responses in the service worker — would be a genuinely
 * second server-state cache, able to answer a fresh query with a stale response and with nothing
 * marking it stale. `src/sw.ts` denylists the API paths for exactly that reason.
 *
 * ⚠ `@tanstack/query-persist-client-core` IS PINNED EXACTLY (no caret) in package.json, to the same
 * version as the `@tanstack/react-query` this workspace already has. A caret lets pnpm resolve a
 * newer persist package with its OWN nested `@tanstack/query-core`, and the two `QueryClient` types
 * are then structurally incompatible — which surfaces as an opaque "#private refers to a different
 * member" error pointing at this file rather than at the version skew that caused it.
 *
 * ⚠ IndexedDB, NOT localStorage. The console's cached screens (an orders list, a catalog page) run
 * to hundreds of kilobytes; localStorage's ~5 MB budget is shared with everything else the origin
 * stores and writing to it is synchronous on the main thread.
 */

const KEY = "effy-shop.query-cache"

/** A day. Older than this and the operator is better served by an empty screen than a stale one. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

function createPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(KEY, client)
      } catch {
        // Blocked or full storage. Offline reads are a convenience; failing to save one must never
        // surface as an error in a console that is otherwise working.
      }
    },
    restoreClient: async () => {
      try {
        return await get<PersistedClient>(KEY)
      } catch {
        return undefined
      }
    },
    removeClient: async () => {
      try {
        await del(KEY)
      } catch {
        /* see above */
      }
    },
  }
}

/**
 * Start persisting.
 *
 * ⚠ `buster` IS THE APP VERSION. A cache restored into a build whose DTOs have changed renders
 * yesterday's shape into today's components — which is not a crash but a screen quietly missing
 * fields, the hardest kind of defect to attribute. A version change throws the cache away instead.
 */
export function startQueryPersistence(queryClient: QueryClient, buildId: string): void {
  if (typeof indexedDB === "undefined") return

  persistQueryClient({
    queryClient,
    persister: createPersister(),
    maxAge: MAX_AGE_MS,
    buster: buildId,
    dehydrateOptions: {
      // ⚠ ONLY SUCCESSFUL QUERIES. Persisting an error would restore a failed screen on next launch
      // and present a transient outage as the console's permanent state.
      shouldDehydrateQuery: (q) => q.state.status === "success",
    },
  })
}

/**
 * Throw the persisted cache away.
 *
 * ⚠ CALLED ON SIGN-OUT, and it is not housekeeping. The cache holds one shop's operational data —
 * orders, customers' delivery suburbs, stock. A shared shop tablet is an explicit edge case in this
 * slice's spec, and leaving the previous operator's shop data readable on it after they sign out
 * would be the one place 059 leaked something.
 */
export async function clearPersistedQueries(): Promise<void> {
  try {
    await del(KEY)
  } catch {
    /* blocked storage — nothing was written either */
  }
}
