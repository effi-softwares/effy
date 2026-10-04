"use client"

/**
 * "Add to list" beside the heart (068 FR-014).
 *
 * The heart keeps its one tap for saving and un-saving; this is the labelled way to reach the list
 * chooser for a product, whatever lists it is or is not in.
 *
 * ⚠ The chooser is loaded on demand, as it is from the heart: `/product/[id]` is a guest route.
 */
export function AddToListButton({ productId, className = "" }: { productId: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => void import("./ListChooser").then((m) => m.openListChooser(productId))}
      className={`text-sm underline-offset-4 hover:underline ${className}`}
    >
      Add to list
    </button>
  )
}
