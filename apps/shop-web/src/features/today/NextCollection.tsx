import { useEffect } from "react"

import { Truck } from "lucide-react"

import type { ShopNextCollectionDTO } from "@effy/shared-types"
import { Skeleton } from "@effy/design-system/ui"

import { track } from "@/lib/telemetry"
import { cn } from "@/lib/utils"
import { DRIVER_WORDS, driverWord, runTime } from "@/features/fulfillment/collection"

export function NextCollection({
  next,
  timezone,
  now,
  loading,
}: {
  next: ShopNextCollectionDTO | null | undefined
  timezone: string | undefined
  now: number
  loading: boolean
}) {
  return (
    <section className="ef-panel min-w-0" aria-labelledby="next-collection">
      <div className="ef-panel__head">
        <h2 id="next-collection" className="ef-panel__title">
          <Truck aria-hidden="true" />
          Next collection
        </h2>
      </div>
      <div className="ef-panel__body grid gap-3">
        {loading ? (
          <>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-4 w-48" />
          </>
        ) : next ? (
          <Body next={next} timezone={timezone} now={now} />
        ) : (
          <p className="text-muted-foreground">No collection runs are set up for your shop yet — Effy will add them.</p>
        )}
      </div>
    </section>
  )
}

function Body({ next, timezone, now }: { next: ShopNextCollectionDTO; timezone: string | undefined; now: number }) {
  const due = next.due.ready + next.due.picking
  const driver = driverWord(next, now)
  useEffect(() => track({ name: "collection_panel_viewed", driver: next.driver }), [next.driver])
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl leading-8 font-semibold tracking-[-.02em] tabular-nums">
          {runTime(next, timezone)}
        </span>
        <span className="text-muted-foreground">Effy driver</span>
      </p>
      {due > 0 ? (
        <div>
          <div className="ef-progress-label">
            <span>
              {next.due.ready} ready · {next.due.picking} still picking
            </span>
            <span>
              {next.due.ready} of {due}
            </span>
          </div>
          <div className="ef-meter ef-meter--lg" role="img" aria-label={`${next.due.ready} of ${due} ready`}>
            <i className="ef-meter__booked" style={{ width: `${(next.due.ready / due) * 100}%` }} />
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">None of your orders are due on this run yet.</p>
      )}
      <p
        className={cn(
          "flex items-center gap-2 text-sm",
          driver === "on_the_way" ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "ef-dot",
            driver === "on_the_way" ? "ef-dot--busy" : driver === "collected" ? "ef-dot--on" : "ef-dot--off",
          )}
        />
        {DRIVER_WORDS[driver]}
      </p>
    </>
  )
}
