"use client"

import Link from "next/link"
import { Heart } from "lucide-react"

import { chromePrefetch } from "@/lib/account-routes"
import { useSavedIds } from "@/lib/saved-store"

/** The header's heart, with how many items are saved. Works for a guest too — saves live on the device. */
export function SavedLink() {
  const count = useSavedIds().length
  return (
    <Link
      href="/saved"
      prefetch={chromePrefetch("/saved")}
      aria-label={count > 0 ? `Saved items, ${count}` : "Saved items"}
      className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-md hover:bg-accent"
    >
      <Heart aria-hidden="true" className="size-5" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] rounded-full border-2 border-background bg-primary px-1 text-center text-[11px] leading-[14px] font-semibold text-primary-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  )
}
