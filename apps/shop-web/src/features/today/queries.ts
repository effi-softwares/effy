import { queryOptions } from "@tanstack/react-query"

import { getToday } from "./repo"

const TODAY_KEY = ["shop", "today"] as const

export const todayQuery = queryOptions({
  queryKey: TODAY_KEY,
  queryFn: getToday,
})
