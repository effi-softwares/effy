import { useQuery } from "@tanstack/react-query"

import { todayQuery } from "./queries"

/**
 * The live count beside the sidebar's Orders item. It reads the screen's cache entry and adds no request,
 * so it equals Needs attention by construction. A zero is not a badge.
 */
export function useNavBadges(): Record<string, number | undefined> {
  const { data } = useQuery(todayQuery)

  return {
    "/orders": data?.backlog.awaitingPick.orders,
  }
}
