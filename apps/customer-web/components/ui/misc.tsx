import Link from "next/link"
import { ChevronRight } from "lucide-react"

import { clsx } from "clsx"

export function Separator({
  orientation = "horizontal",
  className,
}: {
  orientation?: "horizontal" | "vertical"
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx("block shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-5 w-px", className)}
    />
  )
}

/** A loading placeholder. Decorative: the region it stands in for carries the `aria-busy`. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={clsx("sf-skeleton", className)} />
}

export function Avatar({
  initials,
  size = "md",
  className,
}: {
  initials: string
  size?: "md" | "lg"
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted font-semibold",
        size === "md" ? "size-8 text-[13px]" : "size-12 text-base",
        className,
      )}
    >
      {initials}
    </span>
  )
}

export type Crumb = { label: string; href?: string }

/** The reference Breadcrumb. The last crumb is the page itself: text, `aria-current`, never a link. */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((c, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${c.label}-${i}`} className="flex items-center gap-1.5">
              {last || !c.href ? (
                <span aria-current={last ? "page" : undefined} className={clsx(last && "text-foreground")}>
                  {c.label}
                </span>
              ) : (
                <Link href={c.href} className="hover:text-foreground">
                  {c.label}
                </Link>
              )}
              {!last && <ChevronRight aria-hidden="true" className="size-3.5" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** A determinate progress track. `tone` is green for the reference's savings / delivery progress. */
export function Progress({
  value,
  tone = "primary",
  label,
  className,
}: {
  value: number
  tone?: "primary" | "brand"
  label: string
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={clsx("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={clsx("h-full rounded-full", tone === "brand" ? "bg-brand" : "bg-primary")} style={{ width: `${pct}%` }} />
    </div>
  )
}
