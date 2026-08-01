"use client"

import { useState } from "react"

import { btnClass } from "@/components/storefront/kit"

/**
 * Copy a promotion's code to the clipboard.
 *
 * ⚠ The ONLY client component on the promotion page, and it exists because a mistyped promo code
 * reads to a shopper as a refused offer — they blame the promotion, not their typing. The code is
 * rendered as plain selectable text beside it, so a browser that refuses clipboard access (an
 * insecure origin, a denied permission) still leaves the shopper able to select and copy by hand.
 *
 * ⚠ Deliberately imports NOTHING but the shared button classes. This page is guest-reachable and the
 * bundle gate measures it; a convenience button is not a reason to pull a dependency onto a public
 * route. `navigator.clipboard` is the platform API — no library.
 */
export function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // The clipboard can be refused outright (insecure origin, denied permission). Saying nothing
      // is right: the code is on screen and selectable, so the shopper has lost nothing but a
      // shortcut — and a failure toast about a convenience would read as the OFFER having failed.
    }
  }

  return (
    <button type="button" onClick={copy} className={btnClass("primary", "sm")}>
      {copied ? "Copied" : "Copy code"}
    </button>
  )
}
