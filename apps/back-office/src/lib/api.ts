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
