import { persistQueryClient } from "@tanstack/query-persist-client-core"
import type { PersistedClient, Persister } from "@tanstack/query-persist-client-core"
import type { QueryClient } from "@tanstack/react-query"
import { del, get, set } from "idb-keyval"

/**
 * Persist the server-state cache, so the console has something to show when it opens offline
 * .
 *
 * This is the existing query cache rehydrated, not a second cache. TanStack Query remains the one
 * source of truth for server state (Principle VI); all this does is let that cache survive a reload.
 * The alternative — runtime-caching API responses in the service worker — would be a genuinely
 * second server-state cache, able to answer a fresh query with a stale response and with nothing
 * marking it stale. `src/sw.ts` denylists the API paths for exactly that reason.
 *
 * `@tanstack/query-persist-client-core` is pinned exactly (no caret) in package.json, to the same
 * version as the `@tanstack/react-query` this workspace already has. A caret lets pnpm resolve a
 * newer persist package with its own nested `@tanstack/query-core`, and the two `QueryClient` types
 * are then structurally incompatible — which surfaces as an opaque "#private refers to a different
 * member" error pointing at this file rather than at the version skew that caused it.
 *
 * IndexedDB, not localStorage. The console's cached screens (an orders list, a catalog page) run
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

/** Start persisting. `buster` is the app version, so a cache from a build with other DTOs is thrown away, not rendered. */
export function startQueryPersistence(queryClient: QueryClient, buildId: string): void {
  if (typeof indexedDB === "undefined") return

  persistQueryClient({
    queryClient,
    persister: createPersister(),
    maxAge: MAX_AGE_MS,
    buster: buildId,
    dehydrateOptions: {
      // Only successful queries. Persisting an error would restore a failed screen on next launch
      // and present a transient outage as the console's permanent state.
      shouldDehydrateQuery: (q) => q.state.status === "success",
    },
  })
}

/** Throw the persisted cache away, on sign-out: it holds one shop's orders and stock, and tablets are shared. */
export async function clearPersistedQueries(): Promise<void> {
  try {
    await del(KEY)
  } catch {
    /* blocked storage — nothing was written either */
  }
}
