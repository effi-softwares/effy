"use client"

import { ListPlus } from "lucide-react"

/** "Add to list" on the product page; the chooser is imported on press, off the guest bundle. */
export function AddToListButton({
  productId,
  variantId,
  className = "",
}: {
  productId: string
  /** The size on screen, remembered with the product. */
  variantId?: string | null
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => void import("./ListChooser").then((m) => m.openListChooser(productId, undefined, variantId))}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent ${className}`}
    >
      <ListPlus aria-hidden="true" className="size-4" />
      Add to list
    </button>
  )
}
