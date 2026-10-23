"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Cross-tab session sync: after signing out in one tab, another tab still shows the customer's name until
 * it re-renders. Sign-out is a plain form with no JavaScript to broadcast from, so the stale tab checks
 * when it becomes visible: `router.refresh` re-runs the server components and the header comes back as
 * a guest. Mounted only for a signed-in customer; it imports React and the router only.
 */
export function AuthSync() {
  const router = useRouter()

  useEffect(() => {
    function recheck() {
      // Only when the tab is actually being looked at. Refreshing a hidden tab is work nobody sees.
      if (document.visibilityState === "visible") router.refresh()
    }

    document.addEventListener("visibilitychange", recheck)
    // `pageshow` covers the back/forward cache: returning to this page via the Back button must not
    // resurrect a signed-in header from a bfcache snapshot taken before the sign-out.
    window.addEventListener("pageshow", recheck)

    return () => {
      document.removeEventListener("visibilitychange", recheck)
      window.removeEventListener("pageshow", recheck)
    }
  }, [router])

  return null
}
