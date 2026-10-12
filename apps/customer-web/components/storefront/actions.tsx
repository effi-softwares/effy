import Link from "next/link"

import { cn } from "@/lib/utils"

/**
 * THE storefront button — one definition every pill on the public surface resolves to.
 *
 * ⚠ WHY THIS IS A SEPARATE, STRING-ONLY MODULE. Two constraints meet here:
 *
 *  1. **No cva on guest routes.** The design-system `Button`/`buttonVariants` are built on
 *     `class-variance-authority`; importing them here would pull `cva` into the GUEST chunks.
 *     `/search` ships at the 174 KB gate, and no guest-route component imports a cva primitive today
 *     (verified). So the storefront keeps a plain-string button and instead MATCHES the shared
 *     component's look in class terms — same base, same `hover:bg-primary/90`, same `focus-visible`
 *     border+ring, same svg sizing. Two definitions, one appearance; the split is the bundle budget.
 *
 *  2. **No `next/image` on `/search`.** These helpers used to live in `kit.tsx` alongside
 *     `MediaFrame`/`Scrim`, which import `next/image`. Importing a button from that module dragged the
 *     image code into whatever chunk did so — which pushed `/search` (its only kit importer,
 *     `SearchExperience`) OVER the 174 KB gate by 0.2 KB. Splitting the buttons into this
 *     `next/image`-free module is what keeps `/search` cheap. `kit.tsx` re-exports these, so existing
 *     `from ".../kit"` imports keep working; guest routes import straight from here.
 *
 * ⚠ This replaced ~16 hand-rolled `inline-flex … rounded-full bg-primary …` copies scattered across
 * the storefront, account and checkout, whose heights had drifted to h-11 / h-12 / h-14 /
 * min-h-[48px] and whose hover was `opacity-90`. Everything now routes through `ActionLink` (a link)
 * or `ActionButton` (a real `<button>`), so there is one place to change the storefront pill.
 */
// Internal — the class fragments `btnClass`/`ActionLink`/`ActionButton` compose. Not exported: every
// call site uses `btnClass` or the components, so a public `btn` object would be unused API surface.
const btn = {
  base: "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  primary: "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
  brand: "bg-brand text-brand-foreground shadow-xs hover:bg-brand/90",
  outline: "border-input bg-background text-foreground shadow-xs hover:bg-accent",
  muted: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
  ghost: "text-foreground hover:bg-accent",
  link: "h-auto! p-0! text-primary underline underline-offset-4",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  // The reference's button heights: sm 32 · md 36 · lg 40 · xl 48. Phone primary actions use lg or
  // xl, which is what keeps a 44px target there.
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-9 px-4",
  lg: "h-10 px-6",
  xl: "h-12 px-6 text-[15px]",
} as const

export type BtnVariant = "primary" | "brand" | "outline" | "muted" | "ghost" | "link" | "destructive"
export type BtnSize = "sm" | "md" | "lg" | "xl"

export function btnClass(variant: BtnVariant, size: BtnSize = "md", className?: string) {
  return cn(btn.base, btn[variant], btn[size], className)
}

/** A square icon-only button at the reference's sizes (32 / 36 / 40). */
export function iconBtnClass(variant: BtnVariant = "ghost", size: "sm" | "md" | "lg" = "md", className?: string) {
  return cn(
    btn.base,
    btn[variant],
    "p-0",
    size === "sm" && "size-8",
    size === "md" && "size-9",
    size === "lg" && "size-10",
    className,
  )
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
 * The `<button>` counterpart to {@link ActionLink} — for CTAs that act rather than navigate (submit,
 * onClick). ⚠ `type` is NOT defaulted: a bare `<button>` inside a `<form>` submits, and several call
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
