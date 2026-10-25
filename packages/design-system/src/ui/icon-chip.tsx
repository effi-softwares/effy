import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../cn"

// The icon chip: the one component that puts the palette's tints in the UI (card headers, metric tiles).
// A `-soft` ground under a solid glyph, never the reverse. Content is an inline SVG (1.6 stroke,
// `currentColor`, 16×16) or one of the design's glyphs (◈ ◫ ◎ ◐ ▤); never emoji.
const iconChipVariants = cva(
  "inline-grid shrink-0 place-items-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        brand: "bg-brand-soft text-brand",
        violet: "bg-violet-soft text-violet",
        teal: "bg-teal-soft text-teal",
        // Attention only: a cut-off, an unread count, something time-bound.
        attention: "bg-accent2-soft text-accent2",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        destructive: "bg-destructive-soft text-destructive",
        muted: "bg-muted text-muted-foreground",
      },
      size: {
        // 24px in rows, 28px on card headers, 29px on metric tiles.
        sm: "size-6 rounded-lg text-xs [&_svg]:size-4",
        md: "size-7 rounded-lg text-sm [&_svg]:size-4",
        lg: "size-8 rounded-lg text-sm [&_svg]:size-4",
      },
    },
    defaultVariants: { tone: "brand", size: "md" },
  }
)

function IconChip({
  className,
  tone,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof iconChipVariants>) {
  return (
    <span
      data-slot="icon-chip"
      aria-hidden="true"
      className={cn(iconChipVariants({ tone, size }), className)}
      {...props}
    />
  )
}

export { IconChip, iconChipVariants }
