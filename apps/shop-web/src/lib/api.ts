import { ApiClient } from "@effy/api-client"
import { getAccessToken } from "@effy/web-kit"

import { config } from "./env"
import { assertOnline, noteContact, noteNetworkFailure } from "./online"

function guarded(client: ApiClient): ApiClient {
  const MUTATIONS = new Set(["post", "put", "patch", "delete"])
  return new Proxy(client, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver)
      if (typeof original !== "function" || typeof prop !== "string") return original

      const mutates = MUTATIONS.has(prop)
      return async (...args: unknown[]) => {
        if (mutates) assertOnline()
        try {
          const result = await (original as (...a: unknown[]) => Promise<unknown>).apply(target, args)
          noteContact()
          return result
        } catch (err) {
          if (err instanceof TypeError) noteNetworkFailure()
          throw err
        }
      }
    },
  })
}

export const api = guarded(
  new ApiClient({
    baseUrl: config.apiBaseUrl(),
    getToken: () => getAccessToken(),
  }),
)
