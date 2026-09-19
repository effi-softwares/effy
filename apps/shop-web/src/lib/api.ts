import { ApiClient } from "@effy/api-client";
import { getAccessToken } from "@effy/web-kit";

import { config } from "./env";
import { assertOnline, noteContact, noteNetworkFailure } from "./online";

/**
 * 059 US5 — refuse a write while offline, and keep the connectivity signal honest.
 *
 * ⚠ WRAPPED HERE, NOT IN `@effy/api-client`. That package serves three surfaces, and only this one
 * has offline behaviour; putting the guard there would impose shop-web's rules on customer-web and
 * back-office, which have not been designed for them.
 *
 * ⚠ IT REFUSES; IT DOES NOT QUEUE (FR-036, and the operator's own decision). A pick recorded on a
 * tablet and sent an hour later is a claim about a shelf ANOTHER OPERATOR MAY HAVE EMPTIED in
 * between, and the platform has no conflict rule that could settle it. 054 already accepts a
 * residual oversell window it cannot close; a replayed pick would widen it invisibly.
 *
 * ⚠ READS ARE NOT GUARDED. A GET while offline should fail the way it always has and let TanStack
 * Query serve its cache; refusing it would turn a screen that could render last-known data into an
 * error page.
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
          // ⚠ ONLY a network-level failure counts as offline. An HTTP 500 means we REACHED the
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

// One authed fetch wrapper for the whole surface. The ACCESS token (never the ID token) is the
// bearer; the shared gateway's shop authorizer validates it before any handler runs.
//
// Note this package needed NO change to serve a second audience — the cleanest evidence the
// shared foundation was already audience-neutral (SC-009).
export const api = guarded(
  new ApiClient({
    baseUrl: config.apiBaseUrl(),
    getToken: () => getAccessToken(),
  }),
);

/**
 * The HOT path client (core-api) — 057 US5, and the ONLY thing on this surface that uses it.
 *
 * ⚠ A SEPARATE HOST, NOT A SEPARATE CREDENTIAL. It sends the same shop access token; core-api
 * verifies it against the shop pool's own issuer with its own verifier (Principle IV — per-pool
 * validation, not an auth proxy). Every other core-api route rejects this token structurally.
 *
 * ⚠ Do not reach for this for anything else. Shop CRUD belongs on the cold path (Principle III); the
 * refund is here only because the payment secret is.
 */
export const coreApi = guarded(
  new ApiClient({
    baseUrl: config.coreApiBaseUrl(),
    getToken: () => getAccessToken(),
  }),
);
