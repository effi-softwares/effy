import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

// shadcn's badge with the platform's closed status tones:
//
//  in-progress / active → default (brand is an alias)
//  positive / complete → success
//  waiting / at-risk → warning
//  failed / refunded → destructive
//  inert / not-applicable → muted (secondary is an alias)
//
// Every tone is a solid foreground on its own `-soft` tint, contrast-checked by check-tokens.mjs.
const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-md border border-transparent px-2 text-xs font-medium transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary-muted text-primary",
        brand: "bg-primary-muted text-primary",
        success: "bg-success-soft text-success",
        warning: "border-input bg-background text-foreground",
        destructive: "bg-foreground text-background",
        muted: "bg-secondary text-secondary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        // A solid blue tag, for the one thing on a row that needs a person now.
        info: "bg-primary-fill text-primary-foreground",
        // A grey word that steps back further than `muted`.
        quiet: "bg-secondary text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
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
