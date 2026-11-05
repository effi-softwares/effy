import { useEffect, useState } from "react"

/** The time, re-read each half minute so the Now line and "in 18 min" move. A clock: it reads no data. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}
