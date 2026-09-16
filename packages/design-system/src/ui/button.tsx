import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

// THE PLATFORM BUTTON — retuned to the adopted console design (theme-adoption-prompt.md, Phase 2 §1).
//
// ⚠ RADIUS: `rounded-lg` (8px). This is the BUTTON step, one above the 6px control step that inputs,
// selects and nav items take, and one below the 10px container step. The design draws that hierarchy
// deliberately — a button reads as sitting ON a card because it is sharper than the card. Two earlier
// passes collapsed the scale to a single value and the console looked wrong in a way no colour check
// could see; `check-component-shape.mjs` now pins the ordering.
//
// ⚠ NOT A PILL, AND NOT AGAIN. 051 made this `rounded-full` as "the platform's ONE button shape";
// 057 reversed it. A class string is not typechecked and no DOM test looks at corners, so the
// reversal is asserted mechanically rather than trusted to comments.
//
// ⚠ DISABLED REDUCES OPACITY AND SWITCHES THE CURSOR — IT DOES NOT CHANGE COLOUR. A disabled button
// that recolours reads as a different KIND of button rather than as the same button, unavailable.
// That is why there is no `--disabled` fill anywhere below.
//
// ⚠ NO SHADOWS. Flat fills only; the only shadows on this platform are on floating layers (dialog,
// popover, sheet). `shadow-xs` was removed from `outline` here, not overridden at a call site.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-[13.5px] font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-muted disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // PRIMARY — the one action colour. `--primary` and `--brand` are the same value by design.
        default: "bg-primary text-primary-foreground font-semibold hover:opacity-90",
        // SECONDARY — a hairline box on the ground. This is the design's "secondary" button; the
        // variant keeps the name `outline` because that is what several hundred call sites already
        // ask for, and renaming it would be a churn with no visual difference.
        outline:
          "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground",
        // A filled quiet button — the soft tint rather than a border. Used where a secondary action
        // needs slightly more presence than `outline` without competing with the primary.
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        // GHOST — no chrome at all until hovered, and MUTED text at rest. The muted resting colour is
        // what keeps a row of ghost buttons from reading as a row of links.
        ghost: "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-destructive text-destructive-foreground font-semibold hover:opacity-90 focus-visible:ring-destructive/30",
        // ⚠ DESTRUCTIVE-GHOST is the platform's DEFAULT destructive affordance, not the filled one.
        // A solid red button has the visual weight of a primary action, so a screen whose riskiest
        // control is also its loudest teaches people to click it. The filled `destructive` is for
        // confirmation dialogs, where destroying something IS the primary action.
        "destructive-ghost":
          "bg-transparent text-destructive hover:bg-destructive-soft focus-visible:ring-destructive/30",
        link: "text-brand underline-offset-4 hover:underline hover:text-brand-ink",
      },
      size: {
        // ⚠ HEIGHTS TRANSCRIBED FROM THE DESIGN, not rounded to Tailwind's scale: 34px is the button,
        // 32px the in-header secondary, 30px the in-row control. They differ by 2px on purpose — the
        // header and table rows are denser than page content, and snapping all three to `h-9` is what
        // made the earlier pass's toolbars look loose.
        default: "h-[34px] px-3.5 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-[11.5px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        // In-header secondary.
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        // In-row control (table row actions, segmented tabs).
        compact: "h-[30px] gap-1.5 px-2.5 text-[13px] has-[>svg]:px-2",
        lg: "h-10 px-6 has-[>svg]:px-4",
        // The storefront's tall CTA. Kept for customer-web, which shares this component.
        xl: "h-12 px-8 text-base has-[>svg]:px-6",
        icon: "size-[34px]",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        // ⚠ 30px square — the console header's icon buttons (alerts, theme toggle) are this size, and
        // the header relies on them being identical so the right-hand controls sit on one rhythm.
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
