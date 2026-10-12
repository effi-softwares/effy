import * as React from "react"
import { Slot } from "radix-ui"

import { btnClass, type BtnSize, type BtnVariant } from "@/components/storefront/actions"
import { clsx } from "clsx"

/**
 * The storefront Button (reference: shadcn · Actions · Button).
 *
 * ⚠ ONE SOURCE OF BUTTON SHAPE. The classes come from `btnClass` in `components/storefront/actions` —
 * the same function every link-styled-as-a-button uses — so a `<Button>` and an `<ActionLink>` can
 * never be two slightly different buttons. This component only translates shadcn's prop vocabulary.
 *
 * ⚠ Not the console's Button (`@effy/design-system/ui`): that one is shaped and coloured by the
 * console identity, and several of its variants name tokens the storefront theme does not declare —
 * under Tailwind v4 those render as nothing, silently.
 */
const VARIANT: Record<string, BtnVariant> = {
  default: "primary",
  secondary: "muted",
  outline: "outline",
  ghost: "ghost",
  link: "link",
  destructive: "destructive",
  brand: "brand",
}
const SIZE: Record<string, BtnSize> = { sm: "sm", default: "md", lg: "lg", xl: "xl" }

export type ButtonVariant = keyof typeof VARIANT
export type ButtonSize = "sm" | "default" | "lg" | "xl" | "icon" | "icon-sm" | "icon-lg"

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: "default" | "secondary" | "outline" | "ghost" | "link" | "destructive" | "brand"
  size?: ButtonSize
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "button"
  const icon = size === "icon" ? "size-9 p-0" : size === "icon-sm" ? "size-8 p-0" : size === "icon-lg" ? "size-10 p-0" : null
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={clsx(btnClass(VARIANT[variant] ?? "primary", icon ? "md" : (SIZE[size] ?? "md")), icon, className)}
      {...props}
    />
  )
}

export { Button }
