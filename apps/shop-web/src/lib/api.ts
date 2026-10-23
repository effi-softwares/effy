import { ApiClient } from "@effy/api-client";
import { getAccessToken } from "@effy/web-kit";

import { config } from "./env";
import { assertOnline, noteContact, noteNetworkFailure } from "./online";

/**
 * Refuse a write while offline, and keep the connectivity signal honest. Here, not in `@effy/api-client`:
 * only this surface has offline behaviour. Writes are refused, never queued (see `online.ts`); reads are
 * not guarded, so TanStack Query can serve its cache.
 */
function guarded(client: ApiClient): ApiClient {
  const MUTATIONS = new Set(["post", "put", "patch", "delete"]);
  return new Proxy(client, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (typeof original !== "function" || typeof prop !== "string") return original;

      const mutates = MUTATIONS.has(prop);
      return async (...args: unknown[]) => {
        if (mutates) assertOnline();
        try {
          const result = await (original as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          noteContact();
          return result;
        } catch (err) {
          // Only a network-level failure counts as offline. An HTTP 500 means we reached the
          // server, so treating it as a connectivity problem would tell an operator to check their
          // wifi over a backend defect. A DomainError carries a status; a TypeError from fetch does
          // not, and that absence is the discriminator.
          if (err instanceof TypeError) noteNetworkFailure();
          throw err;
        }
      };
    },
  });
}

// One authed fetch wrapper for the whole surface. The access token (never the ID token) is the
// bearer; the shared gateway's shop authorizer validates it before any handler runs.
//
// Note this package needed NO change to serve a second audience — the cleanest evidence the
// shared foundation was already audience-neutral.
export const api = guarded(
  new ApiClient({
    baseUrl: config.apiBaseUrl(),
    getToken: () => getAccessToken(),
  }),
);
