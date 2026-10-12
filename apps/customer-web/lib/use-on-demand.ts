import { useEffect, useState } from "react"

/**
 * A component fetched after the page is interactive — the storefront's replacement for
 * `next/dynamic(…, { ssr: false })` on guest routes (PERF-01).
 *
 * ⚠ WHY NOT `next/dynamic`. Its client runtime measured 1.3 KB gzipped on EVERY guest route, to
 * lazy-load two things. This is the same behaviour — nothing on the server, nothing until the chunk
 * arrives — in one effect. `when` holds the fetch back until it is true (a panel nobody has opened).
 *
 * `load` must be a stable, module-level function: it is the effect's only identity.
 */
export function useOnDemand<P>(
  load: () => Promise<React.ComponentType<P>>,
  when = true,
): React.ComponentType<P> | null {
  const [Loaded, setLoaded] = useState<React.ComponentType<P> | null>(null)

  useEffect(() => {
    if (!when) return
    let current = true
    load()
      // A component is a function; the updater form stops React calling it as one.
      .then((component) => current && setLoaded(() => component))
      // A failed fetch leaves the fallback showing; the next mount tries again.
      .catch(() => {})
    return () => {
      current = false
    }
  }, [load, when])

  return Loaded
}
