import { useEffect, useState, type ReactNode } from "react"

import { m, useMotionValueEvent, useReducedMotion, useSpring } from "motion/react"

import type { ShopNextCollectionDTO } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Bone, Loading } from "@effy/web-kit/patterns"

import { DRIVER_WORDS, driverWord } from "@/features/fulfillment/collection"
import { track } from "@/lib/telemetry"

import { collectionClock, collectionLine } from "./model"

/** A number that rolls to its new value. Motion's own `AnimateNumber` is a paid add-on. */
function RollingNumber({ value }: { value: number }) {
  const calm = useReducedMotion()
  const spring = useSpring(value, { stiffness: 140, damping: 24 })
  const [shown, setShown] = useState(value)
  useEffect(() => spring.set(value), [spring, value])
  useMotionValueEvent(spring, "change", (v) => setShown(Math.round(v)))
  return <>{calm ? value : shown}</>
}

/** The page's head: the countdown and what is left, read as one sentence, with the page's actions on the same row. */
export function CollectionBand({
  next,
  timezone,
  now,
  loading,
  actions,
}: {
  next: ShopNextCollectionDTO | null | undefined
  timezone: string | undefined
  now: number
  loading: boolean
  actions: ReactNode
}) {
  return (
    <section
      aria-label="Next collection"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-7 pb-4 max-md:grid-cols-[auto_minmax(0,1fr)] max-md:gap-x-3.5 max-md:gap-y-2.5"
    >
      {loading ? (
        <div className="col-span-2 flex items-center gap-7 max-md:col-span-full">
          <Loading label="Loading the next collection">
            <Bone kind="title" className="h-16 w-36 flex-none" />
            <div className="grid min-w-0 flex-1 gap-2.5">
              <Bone className="w-80 max-w-full" />
              <Bone kind="small" className="h-1.5 w-full rounded-full" />
              <Bone kind="small" className="w-52" />
            </div>
          </Loading>
        </div>
      ) : next ? (
        <Body next={next} timezone={timezone} now={now} />
      ) : (
        <p className="col-span-2 text-base font-semibold max-md:col-span-1">
          No collection runs are set up for your shop yet. Effy will add them.
        </p>
      )}
      <div className="flex gap-2 self-start max-md:col-span-full max-md:justify-end">{actions}</div>
    </section>
  )
}

function Body({ next, timezone, now }: { next: ShopNextCollectionDTO; timezone: string | undefined; now: number }) {
  const clock = collectionClock(next, now, timezone)
  const total = next.due.ready + next.due.picking
  const driver = driverWord(next, now)
  useEffect(() => track({ name: "collection_panel_viewed", driver: next.driver }), [next.driver])
  return (
    <>
      <p className="flex items-baseline gap-2 text-7xl leading-none font-semibold tracking-[-.045em] whitespace-nowrap max-lg:text-6xl max-md:text-5xl">
        {clock.minutes === null ? clock.big : <RollingNumber value={clock.minutes} />}
        <small className="text-[22px] font-medium tracking-[-.01em] text-muted-foreground max-md:text-lg">{clock.unit}</small>
      </p>
      <div className="min-w-0 max-md:contents">
        <p className="text-[17px] leading-6 font-semibold tracking-[-.01em] max-md:text-[15px] max-md:leading-5">
          {collectionLine(next, clock, timezone)}
        </p>
        {total > 0 ? (
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={next.due.ready}
            aria-label={`${next.due.ready} of ${total} orders ready`}
            className="mt-2 mb-1.5 h-1.5 overflow-hidden rounded-full bg-muted max-md:col-span-full max-md:my-0"
          >
            <m.i
              initial={false}
              animate={{ width: `${(next.due.ready / total) * 100}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 30 }}
              className="block h-full rounded-full bg-brand-fill"
            />
          </div>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-3.5 gap-y-0.5 text-sm text-muted-foreground max-md:col-span-full">
          {total > 0 ? (
            <span>
              <b className="font-semibold text-foreground tabular-nums">
                {next.due.ready} of {total}
              </b>{" "}
              ready{next.due.started > 0 ? ` · ${next.due.started} being picked` : ""}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "inline-block size-2 flex-none rounded-full",
                driver === "on_the_way" ? "live-dot bg-primary-fill" : driver === "collected" ? "bg-success" : "bg-input",
              )}
            />
            {DRIVER_WORDS[driver]}
          </span>
        </p>
      </div>
    </>
  )
}
