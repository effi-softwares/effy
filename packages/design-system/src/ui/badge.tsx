import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

// The status tag: 6px corners, like the controls. The status mapping is closed:
//
//  in-progress / active → brand
//  positive / complete → success
//  waiting / at-risk → warning
//  failed / refunded → destructive
//  inert / not-applicable → muted
//
// Anything else is `muted`. Every tone is a solid foreground on its own `-soft` tint, contrast-checked
// by check-tokens.mjs.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border border-transparent px-2 py-1 text-xs leading-4 font-semibold transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3 focus-visible:border-ring aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // In progress. `default` and `brand` are the same tone.
        default: "bg-brand-soft text-primary",
        brand: "bg-brand-soft text-primary",
        success: "bg-success-soft text-success",
        // Waiting: an outlined tag.
        warning: "border-input bg-background text-foreground",
        // Failed: the foreground as a fill (black, white in dark).
        destructive: "bg-foreground text-background",
        // Inert: the default for anything that does not map. `secondary` is an alias.
        muted: "bg-secondary text-secondary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        // No tint, for where the surrounding row already carries the meaning.
        outline: "border-border bg-transparent font-medium text-foreground",
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
      data-variant={variant ?? "default"}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
