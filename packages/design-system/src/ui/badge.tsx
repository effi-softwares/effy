import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

// THE STATUS PILL (theme-adoption-prompt.md, Phase 2 §5).
//
// ⚠ A PILL, DELIBERATELY — `rounded-full` while every control on the platform is squared. That is not
// an inconsistency: a status chip is a lozenge around a WORD, a shape rather than a step on the radius
// scale. Squared, it reads as a tiny disabled button, which is what it looked like before 057.
// `check-component-shape.mjs` asserts both halves — controls are never pills, this always is.
//
// ⚠ STATUS IS TOLD BY HUE AGAIN, AND THE MAPPING IS CLOSED. Under the monochrome constitution these
// carried weight and borders instead of colour; the adopted design restores a five-tone semantic set,
// and the mapping below is the whole vocabulary:
//
//     in-progress / active     → brand        (the work is moving)
//     positive / complete      → success      (paid, shipped, done)
//     waiting / at-risk        → warning      (awaiting pick, near a cut-off)
//     failed / refunded        → destructive  (money went back, something did not happen)
//     inert / not-applicable   → muted        (nothing to say about it)
//
// ⚠ NOTHING OUTSIDE THAT LIST GETS A COLOUR. A sixth tone is how a palette becomes decoration: if a
// state does not fit one of these five, it is `muted`, not a new hue.
//
// ⚠ EVERY TONE IS A SOLID FOREGROUND ON ITS OWN `-soft` TINT, never a saturated fill with a label on
// it. The tints are the reason the pills read as quiet at a glance and still clear WCAG AA text
// (4.56:1 success, 4.63:1 warning, 4.77:1 destructive, 10.38:1 brand) — pinned by check-tokens.mjs,
// which tests each solid against its own tint precisely because that pair is where a palette quietly
// fails: it looks harmonious and measures 3.4.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 text-[11.5px] font-medium transition-[color,box-shadow] [&>svg]:pointer-events-none [&>svg]:size-3 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-muted aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        // IN-PROGRESS. `default` and `brand` are the same tone; both names exist because call sites
        // read more clearly as one or the other depending on whether the state is named.
        default: "border-brand-mid bg-brand-soft text-brand-ink",
        brand: "border-brand-mid bg-brand-soft text-brand-ink",
        success: "border-border bg-success-soft text-success",
        warning: "border-border bg-warning-soft text-warning",
        destructive: "border-border bg-destructive-soft text-destructive",
        // INERT — the default for anything that does not map. `secondary` is an alias kept so no
        // existing call site has to change.
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
