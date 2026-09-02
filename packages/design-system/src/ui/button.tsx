import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

// ⚠ SQUARED — `rounded-md` (6px on the shop scale), REPLACING the pill this component carried since
// 051. That was a deliberate platform decision and it is being deliberately reversed: the imported
// console design (057) is a squared system, and counting its own declarations settles the number —
// 131 controls at 6px against 17 containers at 8px. A pill button on an 8px card reads as a component
// borrowed from somewhere else, which is the exact complaint the pill was introduced to fix, now
// pointing the other way.
//
// ⚠ THE RADIUS IS A TOKEN, NOT A LITERAL. `rounded-md` resolves per surface, so the customer
// storefront keeps whatever its own token layer says while the shop console goes square. That is what
// makes this safe to change in one shared component (Principle II) rather than forking Button.
//
// ⚠ ICON SIZES ARE NO LONGER CIRCLES. They inherit the same 6px, because the mockup's icon buttons
// (theme toggle, the 28px prev/next pair) are squares with rounded corners, not discs.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Heights transcribed from the mockup: 36px is its form/primary button, 32px its header and
        // toolbar button, 28px its segmented tab and tiny icon pair.
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-10 px-6 has-[>svg]:px-4",
        // ⚠ The storefront's tall CTA pill ("Go to cart", "Add to Cart", "Subscribe"). It exists
        // because the h-9 default sits SHORTER than the h-11 field pill (`input.tsx`), so a button
        // beside a field looked mismatched — which is exactly why `apps/customer-web` used to
        // hand-roll `h-11`/`h-12`/`h-14` pills inline instead of reaching for this component. One
        // size collapses all of those. `text-base` matches the storefront's larger CTA type; pair
        // with `w-full` at the call site for the full-width checkout/cart buttons.
        xl: "h-12 px-8 text-base has-[>svg]:px-6",
        // ⚠ 057: the mockup's 28px control — segmented tabs and the small icon pair on order detail.
        // Below `sm`, above `xs`, and it exists so those never hand-roll a height inline.
        compact: "h-7 gap-1.5 px-2.5 text-[13px] has-[>svg]:px-2",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-compact": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
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
