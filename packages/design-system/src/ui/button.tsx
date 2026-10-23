import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

// The platform button: `rounded-lg` (8px), between the 6px control step and the 10px container step, so
// a button sits visibly on its card; never a pill (check-component-shape.mjs). Disabled lowers opacity
// rather than changing colour. No shadows.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-[13.5px] font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-muted disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Primary: the one action colour.
        default: "bg-primary text-primary-foreground font-semibold hover:opacity-90",
        // Secondary: a hairline box on the ground (named `outline`).
        outline:
          "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        // A quiet filled button: the soft tint instead of a border.
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        // Ghost: no chrome until hovered, muted text at rest so a row of them does not read as links.
        ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground font-semibold hover:opacity-90 focus-visible:ring-destructive/30",
        // The default destructive affordance. The filled `destructive` is for confirmation dialogs,
        // where destroying something is the primary action.
        "destructive-ghost":
          "bg-transparent text-destructive hover:bg-destructive-soft focus-visible:ring-destructive/30",
        link: "text-brand underline-offset-4 hover:underline hover:text-brand-ink",
      },
      size: {
        // Heights from the design: 34px button, 32px in-header, 30px in-row.
        default: "h-[34px] px-3.5 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-[11.5px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        // In-header secondary.
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        // In-row control (table row actions, segmented tabs).
        compact: "h-[30px] gap-1.5 px-2.5 text-[13px] has-[>svg]:px-2",
        lg: "h-10 px-6 has-[>svg]:px-4",
        // The storefront's tall CTA (customer-web).
        xl: "h-12 px-8 text-base has-[>svg]:px-6",
        icon: "size-[34px]",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        // 30px square: the console header's icon buttons, on one rhythm.
        "icon-sm": "size-[30px]",
        "icon-compact": "size-[30px] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
