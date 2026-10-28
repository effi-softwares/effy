import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

// shadcn's button, one step taller (40 default, 36 small, 44 large) with 8px corners. On a touch screen each
// size grows one more step (min-height, so a caller's `h-auto` still wraps), and an icon button reaches 44.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary-fill text-primary-foreground shadow-xs hover:bg-primary-fill/90",
        destructive:
          "bg-destructive-fill text-destructive-foreground shadow-xs hover:bg-destructive-fill/90",
        outline:
          "border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3 pointer-coarse:min-h-11",
        xs: "h-8 gap-1.5 rounded-md px-2.5 text-xs has-[>svg]:px-2 pointer-coarse:min-h-9 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 px-3 has-[>svg]:px-2.5 pointer-coarse:min-h-10",
        lg: "h-11 px-6 has-[>svg]:px-4",
        icon: "size-10 pointer-coarse:min-h-11 pointer-coarse:min-w-11",
        "icon-sm": "size-9 pointer-coarse:min-h-10 pointer-coarse:min-w-10",
        "icon-lg": "size-11",
      },
    },
    compoundVariants: [
      // A link keeps its text height; its tap area grows instead.
      { variant: "link", class: "touch-hit h-auto p-0 has-[>svg]:p-0 pointer-coarse:min-h-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
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
