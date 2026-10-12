"use client"

import { ListPlus } from "lucide-react"

/**
 * "Add to list" on the product page. ⚠ The chooser is imported on the press, not with the page: it is
 * a dialog most visitors never open, and it must not ride the product page's guest bundle.
 */
export function AddToListButton({ productId, className = "" }: { productId: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void import("./ListChooser").then((m) => m.openListChooser(productId))}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-xs hover:bg-accent ${className}`}
    >
      <ListPlus aria-hidden="true" className="size-4" />
      Add to list
    </button>
  )
}
