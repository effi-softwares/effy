import { Check, CircleAlert } from "lucide-react"

import { formatMoment, STATUS_WORD } from "@effy/shared-types"

import { cn } from "@/lib/utils"

import type { JourneyStep } from "../model"

/**
 * Where a package is, step by step in the nine words, with the time it reached each — the one it is at marked and a
 * problem in rose. It is the package's status drawn out, not a log: the record of who did what is the order's
 * activity (104). Across from 900px; a column below.
 */
export function PackageJourney({ steps, now = new Date() }: { steps: readonly JourneyStep[]; now?: Date }) {
  return (
    <ol
      aria-label="Where it is"
      className="m-0 grid list-none gap-3.5 p-0 min-[900px]:auto-cols-fr min-[900px]:grid-flow-col min-[900px]:gap-0"
    >
      {steps.map((s, i) => {
        const done = s.state === "done"
        return (
          <li
            key={s.status}
            aria-current={s.state === "current" ? "step" : undefined}
            className={cn(
              "relative grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-3 min-[900px]:grid-cols-1 min-[900px]:justify-items-start min-[900px]:gap-1.5 min-[900px]:pr-2",
              // The line to the next step: across on wide screens, down below.
              i < steps.length - 1 &&
                "before:absolute before:rounded-full before:content-[''] max-[899px]:before:top-6 max-[899px]:before:-bottom-3.5 max-[899px]:before:left-[9px] max-[899px]:before:w-0.5 min-[900px]:before:top-[9px] min-[900px]:before:right-0 min-[900px]:before:left-5 min-[900px]:before:h-0.5",
              i < steps.length - 1 && (done ? "before:bg-brand-fill" : "before:bg-border"),
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "relative z-[1] grid size-5 place-items-center rounded-full border-2 [&_svg]:size-3",
                done && "border-brand-fill bg-brand-fill text-brand-foreground",
                s.state === "current" && "border-primary-fill bg-primary-fill",
                s.state === "problem" && "border-destructive-fill bg-destructive-fill text-destructive-foreground",
                s.state === "todo" && "border-border bg-background",
              )}
            >
              {done ? <Check /> : s.state === "problem" ? <CircleAlert /> : null}
            </span>
            <span className={cn("truncate text-[13px]", s.state === "todo" ? "text-muted-foreground" : "font-medium")}>
              {STATUS_WORD[s.status]}
              <span className="sr-only">
                {done
                  ? " — done"
                  : s.state === "current"
                    ? " — where it is now"
                    : s.state === "problem"
                      ? " — stopped here"
                      : ""}
              </span>
            </span>
            <span
              className={cn(
                "text-xs tabular-nums whitespace-nowrap",
                s.state === "problem" ? "font-medium text-destructive" : "text-muted-foreground",
              )}
            >
              {s.state === "problem" ? s.note : s.at ? formatMoment(s.at, now) : s.state === "todo" ? "—" : ""}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
