import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * `breakpoint` defaults to shadcn's 768px. The consoles pass their own (1100px), because below it
 * they navigate by a bottom bar and the sidebar must become the off-canvas sheet at the SAME width —
 * otherwise, between the two breakpoints, the icon rail and the bottom bar both render.
 */
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < breakpoint)
    return () => mql.removeEventListener("change", onChange)
  }, [breakpoint])

  return !!isMobile
}
