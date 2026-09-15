import { useQuery } from "@tanstack/react-query"

import { todayQuery } from "./queries"

/**
 * The live count beside the sidebar's Orders item (057 US4, rebased on Today in 058).
 *
 * ⚠ IT READS THE SAME CACHE ENTRY THE SCREEN READS, and adds no request of its own. The rail's count
 * and the Needs attention card are then the same number by construction — not two reads that agree
 * today. A dedicated `/shop/v1/nav-counts` would be a second source for a fact the client already
 * holds: the `summarizeFulfillment` mistake 052 deleted, in a new place.
 *
 * ⚠ A ZERO IS NOT A BADGE. `NavList` renders only a positive count, so a caught-up shop shows a
 * clean rail rather than a row of noughts.
 */
export function useNavBadges(): Record<string, number | undefined> {
  const { data } = useQuery(todayQuery)

  return {
    "/orders": data?.backlog.awaitingPick.orders,
  }
}
