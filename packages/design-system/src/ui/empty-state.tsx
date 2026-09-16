import * as React from "react"

import { cn } from "../cn"

/**
 * THE EMPTY STATE (theme-adoption-prompt.md, Phase 2 §12).
 *
 * A dashed `--border` box at the container radius, centred: a 14px/600 title, a 13px muted line
 * capped at 340px, then ONE secondary button that clears the condition.
 *
 * ⚠ AN EMPTY STATE EXPLAINS AND OFFERS AN EXIT; IT IS NEVER BLANK. A blank region is
 * indistinguishable from a screen that failed to load, and this repository has shipped that exact
 * ambiguity before — 039's hero placeholder was a supported empty state that operators reported as a
 * bug, because nothing on screen said which it was.
 *
 * ⚠ The action is OPTIONAL and singular by design. Where the condition genuinely has no exit — a
 * shop with no orders yet — an invented button ("Create order") would offer something the feature
 * cannot do. Two buttons, meanwhile, means the screen has not decided what the person should do next.
 *
 * ⚠ DASHED, NOT SOLID. A solid border reads as a card that happens to be empty; the dashed rule is
 * what says "content belongs here and there isn't any", which is a different statement.
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
      <div className="text-[14px] font-semibold">{title}</div>
      {description ? (
        <div className="max-w-[340px] text-[13px] text-muted-foreground">{description}</div>
      ) : null}
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
