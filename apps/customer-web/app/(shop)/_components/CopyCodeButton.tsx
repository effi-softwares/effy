"use client"

import { Copy } from "lucide-react"
import { useState } from "react"

import { btnClass } from "@/components/storefront/actions"

/**
 * Copies a promotion's code (a mistyped code reads as a refused offer). The code is also plain
 * selectable text, for a browser that refuses the clipboard. No dependency: a guest route.
 */
export function CopyCodeButton({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // The clipboard can be refused outright (insecure origin, denied permission). Saying nothing
      // is right: the code is on screen and selectable, so the shopper has lost nothing but a
      // shortcut - and a failure toast about a convenience would read as the offer having failed.
    }
  }

  return (
    <button type="button" onClick={copy} className={btnClass("outline", "sm", className)} aria-live="polite">
      <Copy aria-hidden="true" />
      {copied ? "Copied" : "Copy code"}
    </button>
  )
}
