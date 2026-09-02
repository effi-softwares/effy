import { ApiClient } from "@effy/api-client";
import { getAccessToken } from "@effy/web-kit";

import { config } from "./env";

// One authed fetch wrapper for the whole surface. The ACCESS token (never the ID token) is the
// bearer; the shared gateway's shop authorizer validates it before any handler runs.
//
// Note this package needed NO change to serve a second audience — the cleanest evidence the
// shared foundation was already audience-neutral (SC-009).
export const api = new ApiClient({
  baseUrl: config.apiBaseUrl(),
  getToken: () => getAccessToken(),
});

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
export const coreApi = new ApiClient({
  baseUrl: config.coreApiBaseUrl(),
  getToken: () => getAccessToken(),
});
