"use client"

import Link from "next/link"
import { useEffect } from "react"
import { CloudOff, RefreshCcw } from "lucide-react"

import { btnClass } from "@/components/storefront/actions"

/**
 * Something failed while a storefront page was being put together (reference: Help & info · Error).
 *
 * It says whose fault it is — ours — and what is safe: the cart and saved items live apart from
 * the page that failed. A shopper who believes they lost their cart does not try again.
 *
 * The reference is the error's digest: an opaque id that lets us find the failure in our logs. The
 * error's own message is never shown — it is written for us, and may say more than a visitor should
 * read.
 */
export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("storefront error:", error.message)
  }, [error])

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-[520px] space-y-4 py-16 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-lg bg-muted">
          <CloudOff aria-hidden="true" className="size-6" />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Something went wrong on our side</h1>
        <p className="text-base text-muted-foreground">
          It&apos;s not you. Your cart and saved items are safe. Please try again in a moment.
        </p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <button type="button" onClick={reset} className={btnClass("primary", "md")}>
            <RefreshCcw aria-hidden="true" />
            Try again
          </button>
          <Link href="/" className={btnClass("outline", "md")}>
            Go to the home page
          </Link>
        </div>
        {error.digest && <p className="pt-4 font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>}
      </div>
    </div>
  )
}
