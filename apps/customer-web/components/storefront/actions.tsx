import Link from "next/link"

/**
 * The storefront button: one definition every public pill resolves to. Plain strings, not the
 * design-system `Button` (cva would join the guest chunks), matching its look; and apart from `kit.tsx`,
 * whose `next/image` imports would ride along. `ActionLink` is a link, `ActionButton` a real `<button>`.
 */
/**
 * The classes are defined in `app/globals.css` (`@layer components`); this module only names them. A
 * call site's `className` overrides them by the cascade, so `tailwind-merge` stays off guest pages. Do
 * not import `cn` here: client components import this module.
 */
export type BtnVariant = "primary" | "brand" | "outline" | "muted" | "ghost" | "link" | "destructive"
export type BtnSize = "sm" | "md" | "lg" | "xl"

export function btnClass(variant: BtnVariant, size: BtnSize = "md", className?: string) {
  const base = `btn btn-${variant} btn-${size}`
  return className ? `${base} ${className}` : base
}

/** A square icon-only button at the reference's sizes (32 / 36 / 40). */
export function iconBtnClass(variant: BtnVariant = "ghost", size: "sm" | "md" | "lg" = "md", className?: string) {
  const base = `btn btn-${variant} btn-icon-${size}`
  return className ? `${base} ${className}` : base
}

export function ActionLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: {
  href: string
  variant?: BtnVariant
  size?: BtnSize
  className?: string
  children: React.ReactNode
} & Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link href={href} className={btnClass(variant, size, className)} {...props}>
      {children}
    </Link>
  )
}

/**
 * The `<button>` counterpart to {@link ActionLink} - for CTAs that act rather than navigate (submit,
 * onClick). `type` is not defaulted: a bare `<button>` inside a `<form>` submits, and several call
 * sites rely on that, so the caller's `type` (or the native default) wins.
 */
export function ActionButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: BtnVariant
  size?: BtnSize
} & React.ComponentProps<"button">) {
  return (
    <button className={btnClass(variant, size, className)} {...props}>
      {children}
    </button>
  )
}
