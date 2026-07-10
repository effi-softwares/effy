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
