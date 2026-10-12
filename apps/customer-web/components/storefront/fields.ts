/**
 * The storefront's field classes — strings only.
 *
 * ⚠ WHY THIS IS ITS OWN MODULE. `kit.tsx` imports `next/image`; a client component that takes one of
 * these strings from `kit` drags the image code and the rest of the kit into its chunk. The newsletter
 * form sits in the footer of every page, so that cost landed on every guest route (PERF-01). Client
 * components import from here; `kit.tsx` re-exports these, so server-side `from ".../kit"` imports
 * keep working.
 */

// ⚠ Focus is the BORDER changing to `--ring`, matching `@effy/design-system/ui` Input — NOT the old
// `outline-primary` halo these carried, which was a third focus treatment on a platform whose shared
// fields dropped the halo (operator direction). `bg-card` (not the shared Input's transparent) is
// deliberate: the storefront page surface is white `--card`, so a field reads as inset on it.
export const input =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs placeholder:text-muted-foreground outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/10 disabled:opacity-50 md:h-9 md:text-sm"

export const select =
  "h-10 rounded-md border border-input bg-background px-3 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 aria-invalid:border-destructive md:h-9 md:text-sm"
