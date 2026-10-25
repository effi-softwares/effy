import { queryOptions } from "@tanstack/react-query"

import { loadMe } from "./repo"

export const meQuery = queryOptions({
  queryKey: ["shop", "me"] as const,
  queryFn: loadMe,
})
