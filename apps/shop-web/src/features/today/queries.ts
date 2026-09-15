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
 * ⚠ POLLED AT 30 s, WHICH IS THE FALLBACK — not the intended freshness. When the live stream is
 * connected, `useShopLive` drops this to a slow safety refetch and lets pokes drive updates
 * (US2/FR-028); the interval here is what keeps the screen honest when the stream is unavailable,
 * and it is why US1 is shippable before US2 exists.
 *
 * `refetchIntervalInBackground: false` is load-bearing (020 R8): a shop tablet sits open on a bench
 * for hours, and polling a hidden tab bills the platform for reads nobody is looking at. Focus
 * refetch covers the moment the operator comes back.
 */
/** The interval when the live stream is unavailable — the spec's 30 s fallback bound (SC-002). */
export const FALLBACK_INTERVAL_MS = 30_000

/**
 * The interval while the stream IS connected.
 *
 * ⚠ NOT ZERO, and that is deliberate. Pokes are best-effort: PostgreSQL's NOTIFY is not durable, and
 * there is a window during a listener reconnect where a change can be missed by every open console.
 * A slow safety refetch bounds that window at two minutes without putting the polling cost back.
 */
export const LIVE_SAFETY_INTERVAL_MS = 120_000

/** Today's query, paced for whichever mode the screen is actually in (FR-028). */
export const todayQueryFor = (live = false) =>
  queryOptions({
    queryKey: TODAY_KEY,
    queryFn: getToday,
    refetchInterval: live ? LIVE_SAFETY_INTERVAL_MS : FALLBACK_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })

/** The default pacing — polling. `todayQueryFor(true)` slows it down once a stream is connected. */
export const todayQuery = todayQueryFor(false)

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
