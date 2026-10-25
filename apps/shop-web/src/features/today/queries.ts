import { queryOptions } from "@tanstack/react-query"

import { getTeamActivity, getToday } from "./repo"

const TODAY_KEY = ["shop", "today"] as const

export const todayQuery = queryOptions({
  queryKey: TODAY_KEY,
  queryFn: getToday,
})

export const teamActivityQuery = queryOptions({
  queryKey: ["shop", "team-activity"] as const,
  queryFn: getTeamActivity,
  staleTime: 30_000,
})
