import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../cn"

// THE ICON CHIP (theme-adoption-prompt.md, Phase 2 §4).
//
// ⚠ THIS IS THE PRIMARY DEVICE FOR PUTTING COLOUR IN THE UI, and saying so is the point. The adopted
// palette has five tints, and without one named component to hold them the colour ends up sprinkled
// across whatever a screen felt like tinting — which is how a designed palette becomes decoration.
// Card headers and metric tiles reach for this; nothing else tints a surface by hand.
//
// ⚠ `-soft` GROUND, SOLID FOREGROUND, NEVER THE REVERSE. A saturated square with a white glyph has
// the visual weight of a primary button and competes with the one action colour. Every pair here is
// contrast-checked in check-tokens.mjs against its own tint, not against the page background.
//
// ⚠ NO EMOJI. The content is either an inline SVG (1.6 stroke, `currentColor`, 16×16 viewBox) or one
// of the geometric glyphs the design uses for metric chips: ◈ ◫ ◎ ◐ ▤. An emoji renders in the
// system's own palette, ignores `currentColor`, and looks different on every operating system.
const iconChipVariants = cva(
  "inline-grid shrink-0 place-items-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        brand: "bg-brand-soft text-brand",
        violet: "bg-violet-soft text-violet",
        teal: "bg-teal-soft text-teal",
        // ⚠ Attention only — a cut-off, an unread count, something time-bound. If more than one of
        // these is on a screen at once, the screen has stopped distinguishing urgency from content.
        attention: "bg-accent2-soft text-accent2",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        destructive: "bg-destructive-soft text-destructive",
        muted: "bg-muted text-muted-foreground",
      },
      size: {
        // 24px for in-row chips, 28px on card headers, 29px on metric tiles — the design's three.
        sm: "size-6 rounded-[7px] text-[12px] [&_svg]:size-3.5",
        md: "size-7 rounded-lg text-[13px] [&_svg]:size-4",
        lg: "size-[29px] rounded-lg text-[14px] [&_svg]:size-4",
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
