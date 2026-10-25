import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "../cn"

// The consoles' button: 6px corners, 15px text, one height per size (44 default, 40 small, 44 square).
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-[15px] leading-[20px] font-medium whitespace-nowrap transition-[background-color,color,border-color,box-shadow] duration-(--dur-fast) ease-[ease] outline-none focus-visible:border-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-xs hover:bg-[#1a46c4] dark:hover:bg-[color-mix(in_srgb,var(--primary)_70%,#1d4ed8)]",
        outline: "border border-input bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground dark:hover:bg-[#2f2f33]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-[#e9e9ec] dark:hover:bg-[#2f2f33]",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-[#2f2f33]",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-88",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-4.5 has-[>svg]:px-4",
        sm: "h-10 gap-1.5 px-3.5 text-[14px]/[20px] [&_svg:not([class*='size-'])]:size-4",
        icon: "size-11",
      },
    },
    compoundVariants: [{ variant: "link", class: "h-auto p-0 has-[>svg]:p-0" }],
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
