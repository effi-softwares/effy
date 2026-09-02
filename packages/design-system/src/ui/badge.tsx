import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

const badgeVariants = cva(
  // ⚠ 057: a badge is a PILL — `rounded-full`, not `rounded-md`. This is the one place the squared
  // pass makes something rounder, and it is not an inconsistency: the mockup's status chips are all
  // `border-radius:999px`, which is a SHAPE (a lozenge around a word) rather than a step on the radius
  // scale. Controls are square; labels are pills. Keeping the badge on `md` made it read as a tiny
  // disabled button.
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[11.5px] font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        // ⚠ MONOCHROME STATUS TONES. These carried `emerald`/`amber` fills, which are non-monochrome
        // hues the constitution (Principle V, v1.13.0) forbids — feature 041 swept amber out of the
        // platform and success is a non-text indicator only, so it may not colour a badge's text.
        // Status is now told by WEIGHT, not hue, which is how a monochrome platform distinguishes
        // meaning: solid = affirmative/current, outline = attention, muted = lowest emphasis. The
        // three variant NAMES are kept so no call site changes.
        success:
          "border-transparent bg-primary text-primary-foreground",
        warning:
          "border-foreground/30 bg-transparent text-foreground font-semibold",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
