import { ApiClient } from "@effy/api-client"
import { getAccessToken } from "@effy/web-kit"

import { config } from "./env"

export const api = new ApiClient({
  baseUrl: config.apiBaseUrl(),
  getToken: () => getAccessToken(),
})
