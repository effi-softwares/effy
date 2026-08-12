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
  // Mirrors `@effy/design-system/ui` Button's base — same focus ring, svg handling and disabled model,
  // so a storefront pill and a shared Button are indistinguishable.
  base: "inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  outline: "border bg-background hover:bg-accent hover:text-accent-foreground",
  muted: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  sm: "h-9 px-4",
  md: "h-11 px-6",
  lg: "h-12 px-8",
  xl: "h-14 px-10",
} as const

export type BtnVariant = "primary" | "outline" | "muted" | "destructive"
export type BtnSize = "sm" | "md" | "lg" | "xl"

export function btnClass(variant: BtnVariant, size: BtnSize = "md", className?: string) {
  return cn(btn.base, btn[variant], btn[size], className)
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
