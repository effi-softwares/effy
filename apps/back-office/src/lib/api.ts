import { ApiClient } from "@effy/api-client";

import { getAccessToken } from "./auth-session";
import { config } from "./env";

// The app's single API client instance — base URL from config, ACCESS token from the Amplify
// session (attached per request). Server-state cache (TanStack Query) is the source of truth;
// features call this in their `repo.ts` and map DTO→domain (Principle VI).
export const api = new ApiClient({
  baseUrl: config.apiBaseUrl(),
  getToken: () => getAccessToken(),
});

/**
 * The client for `core-api` — the hot path, and the only service that can move money (055).
 *
 * ⚠ SAME BEARER, DIFFERENT HOST, SAME POOL. `core-api` verifies the back-office pool ITSELF, against
 * that pool's own issuer and client id, which is per-pool validation and the shape Principle IV
 * sanctions. Nothing is proxied and no token is forwarded between services.
 *
 * ⚠ Its origin must be in `core-api`'s CORS allowlist, or every refund call fails at the pre-flight
 * with an error that looks nothing like a permissions problem.
 */
export const coreApi = new ApiClient({
  baseUrl: config.coreApiBaseUrl(),
  getToken: () => getAccessToken(),
});
