import * as React from "react"

import { cn } from "../cn"

/**
 * The empty state: a dashed `--border` box (content belongs here and there is none), a title, a muted
 * line and at most one secondary button that clears the condition. Never blank, which would read as a
 * failed load; no invented action where the condition has no exit.
 */
function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title" | "children"> & {
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "grid place-items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center",
        className
      )}
      {...props}
    >
      {icon}
      <div className="text-sm font-semibold">{title}</div>
      {description ? (
        <div className="max-w-85 text-sm text-muted-foreground">{description}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
