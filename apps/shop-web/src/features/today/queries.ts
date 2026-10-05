import { queryOptions } from "@tanstack/react-query"

import { getTeamActivity, getToday } from "./repo"

// ⚠ ONE QUERY, ONE CACHE ENTRY, ONE SOURCE FOR THE BACKLOG (FR-006). The Needs attention row, its
// unit figure, the open-items badge, the glance cell, the sidebar badge and both of Insights'
// fulfilment cells all render from THIS entry. Not "six components that each fetch the same thing
// and agree today" — a second read is a second answer waiting to happen, which is precisely how
// 052's `summarizeFulfillment` came to disagree with the server it was summarising.
export const TODAY_KEY = ["shop", "today"] as const

/**
 * How often Today is re-read while it is on screen.
 *
 * ⚠ THIS IS THE FRESHNESS, NOT A FALLBACK (070). Until 070 a server-push stream told the console
 * when to re-read and this interval only covered the stream being down; the stream went with the
 * always-on backend that carried it, and the under-ten-seconds target went with it. A change now
 * shows within thirty seconds. A cheaper way to do better is deferred, not designed.
 */
export const REFRESH_INTERVAL_MS = 30_000

/**
 * Today's snapshot.
 *
 * `refetchIntervalInBackground: false` is load-bearing (020 R8): a shop tablet sits open on a bench
 * for hours, and polling a hidden tab bills the platform for reads nobody is looking at. Focus
 * refetch covers the moment the operator comes back.
 *
 * Every refresh is an ordinary authorised request, so an operator who is disabled or moved to
 * another shop stops seeing this shop's data at the next one — there is no long-lived connection
 * to re-check.
 */
export const todayQuery = queryOptions({
  queryKey: TODAY_KEY,
  queryFn: getToday,
  refetchInterval: REFRESH_INTERVAL_MS,
  refetchIntervalInBackground: false,
})

/**
 * Team activity — fetched only when the sheet opens (`enabled`), and not polled.
 *
 * A shift's history does not change while you read it, and a console left open on this sheet should
 * not bill the platform for re-reading two weeks of audit rows every fifteen seconds.
 */
export const teamActivityQuery = queryOptions({
  queryKey: ["shop", "team-activity"] as const,
  queryFn: getTeamActivity,
  staleTime: 30_000,
})
