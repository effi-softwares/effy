import { clsx } from "clsx"

const variants = {
  default: "bg-primary-fill text-primary-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  outline: "border-border text-foreground",
  brand: "bg-brand-fill text-brand-foreground",
  "brand-muted": "bg-brand-muted text-brand",
  "primary-muted": "bg-primary-muted text-primary",
  dark: "bg-foreground text-background",
  // The console's names, kept so a call site moved from `@effy/design-system/ui` reads the same.
  // Positive is green-on-tint; there is no red, so "destructive" is the dark badge.
  success: "bg-brand-muted text-brand",
  destructive: "bg-foreground text-background",
  muted: "bg-secondary text-secondary-foreground",
} as const

export type BadgeVariant = keyof typeof variants

/** The reference Badge — `rounded-md`, not a pill. Sale is `brand`; New is `default`; Unavailable is `dark`. */
export function Badge({
  variant = "default",
  className,
  ...props
}: React.ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      data-slot="badge"
      className={clsx(
        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold whitespace-nowrap [&_svg]:size-3",
        // `outline` names its own border colour; two border colours on one element is decided by
        // stylesheet order, so the transparent one is only added where no other is.
        variant !== "outline" && "border-transparent",
        variants[variant],
        className,
      )}
      {...props}
    />
  )
}
