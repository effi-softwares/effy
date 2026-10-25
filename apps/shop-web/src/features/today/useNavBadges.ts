import { useQuery } from "@tanstack/react-query"

import { todayQuery } from "./queries"

export function useNavBadges(): Record<string, number | undefined> {
  const { data } = useQuery(todayQuery)

  return {
    "/orders": data?.backlog.awaitingPick.orders,
  }
}
