import { useEffect, useState } from "react"

/**
 * A render clock — the current time, re-published on an interval (058, FR-009/FR-029).
 *
 * ⚠ THIS IS NOT CACHED SERVER DATA, and that distinction is why it may live in component state at
 * all (Principle VI). Nothing here is fetched: it exists so "Just now" becomes "1 min ago" and
 * "oldest 3 h 12 m" keeps counting while a tab sits open with no new data at all. A screen whose
 * ages freeze at the moment of the last fetch is worse than one with no ages, because a stale "Just
 * now" is read as fresh.
 *
 * ⚠ THE INTERVAL IS CLEARED ON UNMOUNT (FR-029). A console tab lives for a whole shift and the
 * operator moves between screens all day; an interval per visit, never cleared, is a leak that only
 * shows up hours later as a warm laptop.
 */
export function useNow(everyMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])

  return now
}
