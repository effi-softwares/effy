import { useEffect } from "react"

import { Truck } from "lucide-react"

import type { ShopNextCollectionDTO } from "@effy/shared-types"
import { Progress, Skeleton } from "@effy/design-system/ui"
import { Panel } from "@effy/web-kit/patterns"

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
    <Panel icon={<Truck aria-hidden="true" />} title="Next collection">
      <div className="grid gap-3">
        {loading ? (
          <>
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-4 w-48" />
          </>
        ) : next ? (
          <Body next={next} timezone={timezone} now={now} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No collection runs are set up for your shop yet — Effy will add them.
          </p>
        )}
      </div>
    </Panel>
  )
}

function Body({ next, timezone, now }: { next: ShopNextCollectionDTO; timezone: string | undefined; now: number }) {
  const due = next.due.ready + next.due.picking
  const driver = driverWord(next, now)
  useEffect(() => track({ name: "collection_panel_viewed", driver: next.driver }), [next.driver])
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-xl leading-7 font-semibold tracking-[-.02em] tabular-nums">
          {runTime(next, timezone)}
        </span>
        <span className="text-sm text-muted-foreground">Effy driver</span>
      </p>
      {due > 0 ? (
        <div>
          <div className="mb-1 flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>
              {next.due.ready} ready · {next.due.picking} still picking
            </span>
            <span>
              {next.due.ready} of {due}
            </span>
          </div>
          <Progress height={8} value={(next.due.ready / due) * 100} label={`${next.due.ready} of ${due} ready`} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">None of your orders are due on this run yet.</p>
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
            "inline-block size-2 flex-none rounded-full",
            driver === "on_the_way" ? "bg-primary-fill" : driver === "collected" ? "bg-success" : "bg-input",
          )}
        />
        {DRIVER_WORDS[driver]}
      </p>
    </>
  )
}
