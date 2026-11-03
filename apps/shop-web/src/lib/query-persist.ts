import { persistQueryClient, type PersistedClient, type Persister } from "@tanstack/query-persist-client-core"
import type { QueryClient } from "@tanstack/react-query"
import { del, get, set } from "idb-keyval"

const KEY = "effy-shop.query-cache"

const MAX_AGE_MS = 24 * 60 * 60 * 1000

function createPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await set(KEY, client)
      } catch {}
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
      } catch {}
    },
  }
}

/**
 * Saves the cache between visits. Resolves once the saved cache is back, so writes paused while offline (they are
 * saved too) can be resumed - their functions must be registered with `setMutationDefaults` before this runs.
 */
export function startQueryPersistence(queryClient: QueryClient, buildId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve()

  const [, restored] = persistQueryClient({
    queryClient,
    persister: createPersister(),
    maxAge: MAX_AGE_MS,
    buster: buildId,
    dehydrateOptions: {
      shouldDehydrateQuery: (q) => q.state.status === "success",
    },
  })
  return restored.catch(() => undefined)
}

export async function clearPersistedQueries(): Promise<void> {
  try {
    await del(KEY)
  } catch {}
}
