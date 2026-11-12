import { queryOptions } from "@tanstack/react-query"

import { getHousekeeping } from "./repo"

/** Re-read on the live kind `housekeeping` (features/live/routes.ts): a clean-up ran, or the abandon time changed. */
export const HOUSEKEEPING_ROOT = ["settings", "housekeeping"] as const

export const housekeepingQuery = queryOptions({ queryKey: HOUSEKEEPING_ROOT, queryFn: getHousekeeping })
