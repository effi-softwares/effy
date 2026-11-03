import { queryOptions } from "@tanstack/react-query"

import { loadMe, loadTeam } from "./repo"

export const meQuery = queryOptions({
  queryKey: ["back-office", "me"] as const,
  queryFn: loadMe,
})

/** Settings › Team and access (admin only). */
export const teamQuery = queryOptions({
  queryKey: ["back-office", "team"] as const,
  queryFn: loadTeam,
})
