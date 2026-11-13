import { queryOptions } from "@tanstack/react-query"

import { getMember, loadMe } from "./repo"

export const meQuery = queryOptions({
  queryKey: ["back-office", "me"] as const,
  queryFn: loadMe,
})

/** Everything under Team and access; the live kind `team` re-reads it all (119 R13). */
export const TEAM_ROOT = ["back-office", "team"] as const

export const memberQuery = (id: string) =>
  queryOptions({ queryKey: [...TEAM_ROOT, "member", id] as const, queryFn: () => getMember(id) })
