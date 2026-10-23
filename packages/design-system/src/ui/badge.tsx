import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

// The status pill: `rounded-full`, while every control is squared (a lozenge around a word is a shape,
// not a radius step). The status mapping is closed:
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
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-muted aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // In progress. `default` and `brand` are the same tone.
        default: "border-brand-mid bg-brand-soft text-brand-ink",
        brand: "border-brand-mid bg-brand-soft text-brand-ink",
        success: "border-border bg-success-soft text-success",
        warning: "border-border bg-warning-soft text-warning",
        destructive: "border-border bg-destructive-soft text-destructive",
        // Inert: the default for anything that does not map. `secondary` is an alias.
        muted: "border-border bg-muted text-muted-foreground",
        secondary: "border-border bg-muted text-muted-foreground",
        // A pill with no tint, for where the surrounding row already carries the meaning.
        outline: "border-border bg-transparent text-foreground",
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
