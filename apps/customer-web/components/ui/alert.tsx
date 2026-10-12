import { CircleAlert, CircleCheck, Info } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

const variants = {
  default: { box: "border-border bg-card", icon: "" , Icon: Info },
  // ⚠ There is no red on the storefront. A destructive alert is a BLACK border, a heavier title and
  // an alert glyph — the icon and the wording carry the meaning a hue would have.
  destructive: { box: "border-destructive bg-card", icon: "", Icon: CircleAlert },
  success: { box: "border-transparent bg-brand-muted", icon: "text-brand", Icon: CircleCheck },
  info: { box: "border-transparent bg-primary-muted", icon: "text-primary", Icon: Info },
  muted: { box: "border-transparent bg-muted", icon: "", Icon: Info },
} as const

export type AlertVariant = keyof typeof variants

/**
 * The reference Alert: a 16px glyph, a title, an optional description.
 *
 * `live` picks the announcement: an error interrupts (`role="alert"`), everything else waits its turn
 * (`role="status"`). Pass `live={false}` for a notice that was on the page when it loaded.
 */
export function Alert({
  variant = "default",
  title,
  icon,
  live,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  variant?: AlertVariant
  title?: React.ReactNode
  icon?: LucideIcon
  live?: boolean
}) {
  const v = variants[variant]
  const Icon = icon ?? v.Icon
  const announce = live ?? variant === "destructive"
  return (
    <div
      data-slot="alert"
      role={announce ? (variant === "destructive" ? "alert" : "status") : undefined}
      className={cn(
        "grid grid-cols-[1rem_1fr] items-start gap-x-3 gap-y-0.5 rounded-lg border px-4 py-3 text-sm",
        v.box,
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4", v.icon)} />
      <div className="min-w-0">
        {title && (
          <p className={cn("leading-5", variant === "destructive" ? "font-semibold" : "font-medium")}>{title}</p>
        )}
        {children && (
          <div className={cn("leading-5", variant === "destructive" ? "text-foreground" : "text-muted-foreground")}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
