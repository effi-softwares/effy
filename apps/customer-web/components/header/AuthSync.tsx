"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Cross-tab session sync (012 FR-030).
 *
 * The problem: a customer signed in across two tabs signs out in one. The cookies are gone
 * immediately — so the other tab's session is genuinely dead — but that tab has already rendered, and
 * it goes on displaying their name and avatar until something makes it re-render. It looks signed in
 * while being signed out, which is exactly the confusion FR-030 forbids.
 *
 * ⚠ WHY `visibilitychange` AND NOT `BroadcastChannel`.
 *
 * The obvious fix is for the signing-out tab to broadcast. It cannot: sign-out is a plain HTML
 * `<form action="/sign-out" method="post">` (see AccountMenu.tsx) precisely so the header never
 * imports the auth SDK — which means there is no JavaScript running in that tab to *do* the
 * broadcasting. Adding some back would re-create the exact import edge the quarantine exists to
 * prevent, to solve a problem that has a cheaper answer.
 *
 * So the STALE tab checks for itself, at the only moment its staleness could possibly matter: when
 * the customer looks at it. `router.refresh()` re-runs the server components, the cookie is gone, and
 * the header comes back as a guest — before they have had time to read it.
 *
 * ⚠ Mounted ONLY for a signed-in customer (see UserIsland). A guest never downloads this, and the
 * guest bundle is untouched — which is the whole point of the storefront's architecture.
 *
 * It imports nothing but React and the router. No Amplify, no SDK, no session logic.
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
    // resurrect a signed-in header from a bfcache snapshot taken before the sign-out (FR-029).
    window.addEventListener("pageshow", recheck)

    return () => {
      document.removeEventListener("visibilitychange", recheck)
      window.removeEventListener("pageshow", recheck)
    }
  }, [router])

  return null
}
