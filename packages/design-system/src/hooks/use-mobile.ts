import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * `breakpoint` defaults to shadcn's 768px. The consoles pass 1100px, where they switch to a bottom bar,
 * so the sidebar becomes the off-canvas sheet at the same width.
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
