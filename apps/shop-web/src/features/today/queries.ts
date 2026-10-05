import { queryOptions } from "@tanstack/react-query"

import { getTeamActivity, getToday } from "./repo"

// ⚠ ONE QUERY, ONE CACHE ENTRY, ONE SOURCE FOR THE BACKLOG (FR-006). The Needs attention row, its
// unit figure, the open-items badge, the glance cell, the sidebar badge and both of Insights'
// fulfilment cells all render from THIS entry. Not "six components that each fetch the same thing
// and agree today" — a second read is a second answer waiting to happen, which is precisely how
// 052's `summarizeFulfillment` came to disagree with the server it was summarising.
export const TODAY_KEY = ["shop", "today"] as const

/**
 * Today's snapshot.
 *
 * ⚠ NOT POLLED (071). It is read when the screen opens, when the operator comes back to the tab,
 * and when the platform says this shop's orders, stock or attention list changed — the console's
 * `LiveProvider` invalidates this key (`features/live/routes.ts`). A tablet left open on a bench
 * for a quiet hour makes no request at all.
 *
 * Every read is an ordinary authorised request, so an operator who is disabled or moved to another
 * shop is refused at the next one; the live channel itself stops telling them within fifteen
 * minutes.
 */
export const todayQuery = queryOptions({
  queryKey: TODAY_KEY,
  queryFn: getToday,
})

/**
 * Team activity — fetched only when the sheet opens (`enabled`). A shift's history does not change
 * while you read it.
 */
export const teamActivityQuery = queryOptions({
  queryKey: ["shop", "team-activity"] as const,
  queryFn: getTeamActivity,
  staleTime: 30_000,
})
