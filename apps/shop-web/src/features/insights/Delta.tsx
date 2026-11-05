import { ArrowDown, ArrowUp, Minus } from "lucide-react"

import { cn } from "@effy/design-system"
import type { InsightsFigureDTO } from "@effy/shared-types"

import { changeOf } from "./model"

/** A change against the period before: up or down in words for a screen reader, coloured by whether it is good news. */
export function Delta({
  figure,
  unit = "%",
  goodWhenUp = true,
  label,
  small = false,
}: {
  figure: InsightsFigureDTO | null
  unit?: string
  goodWhenUp?: boolean
  label?: string
  small?: boolean
}) {
  const change = figure ? changeOf(figure, unit, goodWhenUp) : null
  if (!change) return <span className={cn("text-muted-foreground", small ? "text-[12.5px]" : "text-sm")}>Nothing to compare yet</span>
  const Icon = change.direction === "up" ? ArrowUp : change.direction === "down" ? ArrowDown : Minus
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap tabular-nums",
        small ? "text-[12.5px]" : "text-sm",
        change.tone === "good" ? "text-success" : change.tone === "bad" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Icon aria-hidden="true" className={small ? "size-3" : "size-3.5"} />
      <span className="sr-only">{change.direction === "up" ? "Up " : change.direction === "down" ? "Down " : "No change "}</span>
      {change.text}
      {label ? <span className="ml-1 text-muted-foreground">{label}</span> : null}
    </span>
  )
}
