import { Link } from "@tanstack/react-router"
import { CircleAlert, CircleCheck, Clock, TriangleAlert } from "lucide-react"

import { cn } from "@effy/design-system"
import { Badge } from "@effy/design-system/ui"
import { Bone, Loading } from "@effy/web-kit/patterns"

import { clockWords, untilWords, type Brief, type BriefPart, type ComingItem } from "./model"

const TONE = {
  good: { variant: "success", icon: CircleCheck },
  bad: { variant: "destructive", icon: CircleAlert },
  warn: { variant: "warning", icon: TriangleAlert },
  quiet: { variant: "muted", icon: Clock },
} as const

function Parts({ parts }: { parts: readonly BriefPart[] }) {
  return parts.map((p, i) =>
    p.to ? (
      <Link
        key={i}
        to={p.to}
        className="underline decoration-input decoration-2 underline-offset-[5px] transition-colors hover:decoration-foreground"
      >
        {p.text}
      </Link>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  )
}

/** One sentence about the whole day, then the next three things on the clock. */
export function StatusBrief({
  brief,
  coming,
  nowH,
}: {
  brief: Brief | null
  coming: readonly ComingItem[] | null
  nowH: number
}) {
  if (!brief) {
    return (
      <Loading label="Loading how today is going">
        <div className="mt-2 mb-8">
          <Bone className="mb-2.5 h-6 w-28" />
          <Bone kind="heading" className="h-6 w-full max-w-[560px]" />
          <Bone kind="heading" className="mt-2 h-6 w-full max-w-[420px]" />
          <div className="mt-[18px] grid grid-cols-3 border-y py-2.5 max-md:grid-cols-1">
            {[0, 1, 2].map((i) => (
              <Bone key={i} className="h-9 w-44" />
            ))}
          </div>
        </div>
      </Loading>
    )
  }
  const tone = TONE[brief.tone]
  return (
    <div className="mt-2 mb-8">
      <div className={cn(brief.stopped && "rounded-lg bg-destructive-soft px-6 py-5 max-md:px-4 max-md:py-4")}>
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Badge variant={tone.variant}>
            <tone.icon aria-hidden="true" />
            {brief.label}
          </Badge>
          <Badge variant="outline">
            <span
              aria-hidden="true"
              className="size-2 animate-[effy-pulse_2s_ease-in-out_infinite] rounded-full bg-brand-fill"
            />
            Live
          </Badge>
        </div>
        <p
          role="status"
          className="max-w-[900px] text-[26px] leading-[34px] font-semibold tracking-[-0.022em] text-pretty max-md:text-xl max-md:leading-7"
        >
          <Parts parts={brief.lead} />{" "}
          <span className="font-medium text-muted-foreground">
            <Parts parts={brief.rest} />
          </span>
        </p>
      </div>
      {coming && coming.length > 0 ? (
        <ul aria-label="Coming up" className="mt-[18px] grid grid-cols-3 border-y max-md:grid-cols-1">
          {coming.map((c, i) => {
            const soon = c.at - nowH <= 0.5
            return (
              <li
                key={`${c.title}-${c.at}`}
                className={cn(
                  "min-w-0 border-l md:first:border-l-0 max-md:border-l-0 max-md:border-t max-md:first:border-t-0",
                  i === 0 ? "md:pr-4" : "md:px-4",
                )}
              >
                <Link
                  to="/orders/assignments"
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-2.5 py-2.5 no-underline hover:bg-row-hover"
                >
                  <b className="truncate font-medium">{c.title}</b>
                  <time
                    className={cn(
                      "row-span-2 self-center text-[15px] font-semibold tracking-[-0.01em] tabular-nums",
                      soon && "text-accent2",
                    )}
                    title={clockWords(c.at)}
                  >
                    {untilWords(c.at, nowH)}
                  </time>
                  <small className="col-start-1 truncate text-[13px] text-muted-foreground">{c.detail}</small>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
