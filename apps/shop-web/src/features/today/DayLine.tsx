import { useEffect, useRef, useState } from "react"

import { Link, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, m } from "motion/react"
import {
  ArrowRight,
  Check,
  ClipboardList,
  Loader2,
  PackageX,
  ReceiptText,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react"

import type { ShopTodayDTO, ShopTodayEventDTO } from "@effy/shared-types"
import { cn } from "@effy/design-system"
import { Button, toast } from "@effy/design-system/ui"
import { Bone, Loading } from "@effy/web-kit/patterns"

import { fulfillmentMutationError } from "@/features/fulfillment/errorText"
import { formatMoney } from "@/features/fulfillment/orderConsole"
import { invalidateOrders } from "@/features/fulfillment/queries"
import { transitionFulfillment } from "@/features/fulfillment/repo"

import { aheadWords, eventTime, eventWords, type Job } from "./model"
import { todayQuery } from "./queries"

const GLIDE = { type: "spring", stiffness: 380, damping: 34 } as const
/** Long enough to see a started job rise into the bar before the order opens. */
const LEAVE_MS = 380

/** The last few events above the bar. The bar itself holds the newest. */
const ABOVE_BAR = 3

/**
 * The whole of Today on one line of time: what just happened, Now, what is next. A live status strip, not a log: the
 * last few events and no more, with the log itself one press away in the Activity drawer.
 */
export function DayLine({
  events,
  ahead,
  yesterday,
  jobs,
  more,
  timezone,
  onEarlier,
}: {
  events: readonly ShopTodayEventDTO[]
  ahead: ShopTodayDTO["ahead"]
  yesterday: ShopTodayDTO["yesterday"]
  jobs: readonly Job[]
  more: number
  timezone: string
  onEarlier: () => void
}) {
  const [latest, ...rest] = events
  const above = rest.slice(0, ABOVE_BAR).reverse()
  return (
    <section aria-label="What just happened and what is next" className="dayline">
      {above.length === 0 && yesterday ? (
        <p data-tour="today.yesterday" className="dayline__event opacity-75">
          <span className="dayline__when">Yesterday</span>
          <span aria-hidden="true" className="dayline__node">
            <i className="size-2 rounded-full bg-input" />
          </span>
          <span className="min-w-0">
            <span className="mr-2 md:hidden">Yesterday:</span>
            <span className="font-medium">
              {yesterday.orders} {yesterday.orders === 1 ? "order" : "orders"}
            </span>
            <span className="ml-2 opacity-70">{formatMoney(yesterday.revenue)}</span>
          </span>
        </p>
      ) : null}
      {above.length > 0 ? (
        <ol>
          {above.map((e, i) => (
            <m.li
              key={e.id}
              layout="position"
              transition={GLIDE}
              className={cn("dayline__event", above.length - i === 3 && "opacity-50", above.length - i === 2 && "opacity-75")}
            >
              <time className="dayline__when" dateTime={e.at}>
                {eventTime(e.at, timezone)}
              </time>
              <span aria-hidden="true" className="dayline__node">
                <i className="size-2 rounded-full bg-input" />
              </span>
              <m.span layoutId={`event-${e.id}`} transition={GLIDE} className="min-w-0">
                <EventText event={e} />
              </m.span>
            </m.li>
          ))}
        </ol>
      ) : null}
      <NowBar latest={latest} events={events} timezone={timezone} onEarlier={onEarlier} />
      <Work jobs={jobs} more={more} />
      <LaterToday ahead={ahead} timezone={timezone} />
    </section>
  )
}

/** The line carries on past the work: what is still to come, so a quiet page has something to look ahead to. */
function LaterToday({ ahead, timezone }: { ahead: ShopTodayDTO["ahead"]; timezone: string }) {
  if (ahead.length === 0) return null
  return (
    <div data-tour="today.later" className="pt-3">
      <p className="relative pb-1 pl-[calc(var(--gut)+40px)] text-sm font-medium text-muted-foreground max-md:pl-[34px]">Later today</p>
      <ol>
        {ahead.map((a) => {
          const { words, note } = aheadWords(a)
          return (
            <li key={`${a.kind}-${a.at}`} className="dayline__event">
              <time className="dayline__when" dateTime={a.at}>
                {eventTime(a.at, timezone)}
              </time>
              <span aria-hidden="true" className="dayline__node">
                <i className="size-2.5 rounded-full border-2 border-input bg-background" />
              </span>
              <span className="min-w-0">
                {/* A phone has no time column, and a line ahead means nothing without its time. */}
                <span className="mr-2 text-muted-foreground tabular-nums md:hidden">{eventTime(a.at, timezone)}</span>
                <span className="font-medium">{words}</span>
                {note ? <span className="ml-2 text-muted-foreground">{note}</span> : null}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function EventText({ event }: { event: ShopTodayEventDTO }) {
  const { code, words, note } = eventWords(event)
  return (
    <>
      {code ? <span className="font-mono text-sm font-semibold">{code} </span> : null}
      <span className="font-medium">{words}</span>
      {note ? <span className="ml-2 opacity-70">{note}</span> : null}
    </>
  )
}

function NowBar({
  latest,
  events,
  timezone,
  onEarlier,
}: {
  latest: ShopTodayEventDTO | undefined
  events: readonly ShopTodayEventDTO[]
  timezone: string
  onEarlier: () => void
}) {
  const [seen, setSeen] = useState(latest?.id)
  const [ping, setPing] = useState(false)
  const previous = useRef(latest?.id)

  // A new order is the one thing worth raising the bar for.
  useEffect(() => {
    if (latest?.id !== previous.current && latest?.kind === "came_in") setPing(true)
    previous.current = latest?.id
  }, [latest])

  const unseen = seen === undefined ? events.length : Math.max(0, events.findIndex((e) => e.id === seen))

  return (
    <div data-tour="today.now" className="now-bar" aria-label="Live activity">
      <div className={cn("now-bar__in", ping && "is-ping")} onAnimationEnd={() => setPing(false)}>
        <span className="pr-2 text-right font-semibold max-md:pr-0">Now</span>
        <span aria-hidden="true" className="grid place-items-center max-md:hidden">
          <span className="live-dot size-2 rounded-full bg-primary text-primary" />
        </span>
        <span aria-live="polite" className="min-w-0 truncate">
          {latest ? (
            <m.span layoutId={`event-${latest.id}`} transition={GLIDE} className="inline-block">
              <EventText event={latest} />
            </m.span>
          ) : (
            <span className="opacity-70">Nothing yet today</span>
          )}
        </span>
        {latest ? (
          <time className="text-sm tabular-nums opacity-65 max-md:hidden" dateTime={latest.at}>
            {eventTime(latest.at, timezone)}
          </time>
        ) : null}
        {/* The whole log is the one Activity drawer (104): no second way to read it. */}
        {latest ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-inherit hover:bg-background/15 hover:text-inherit"
            onClick={() => {
              setSeen(latest.id)
              onEarlier()
            }}
          >
            Earlier
            {unseen > 1 ? (
              <span className="grid h-5 min-w-5 place-items-center rounded-md bg-primary-fill px-1 text-xs font-semibold text-primary-foreground">
                {unseen}
              </span>
            ) : null}
            <ArrowRight aria-hidden="true" />
          </Button>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}

const JOB_ICON: Record<Job["kind"], LucideIcon> = {
  pick: ClipboardList,
  open: ClipboardList,
  out_of_stock: PackageX,
  low_stock: TriangleAlert,
  refund: ReceiptText,
}

function Work({ jobs, more }: { jobs: readonly Job[]; more: number }) {
  const [lead, ...then] = jobs
  if (!lead) {
    return (
      <div className="dayline__row">
        <span />
        <span aria-hidden="true" className="dayline__node mt-7">
          <i className="size-2 rounded-full bg-input" />
        </span>
        <div className="py-4">
          <p className="flex items-center gap-2.5 text-2xl font-semibold tracking-[-.02em]">
            <span className="grid size-8 place-items-center rounded-full bg-success-soft text-success">
              <Check aria-hidden="true" className="size-4" />
            </span>
            All clear
          </p>
          <p className="ml-[42px] text-muted-foreground">Nothing is waiting on you. New work appears here.</p>
        </div>
      </div>
    )
  }
  const LeadIcon = JOB_ICON[lead.kind]
  return (
    <>
      <div data-tour="today.next" className="dayline__row">
        <span className={cn("dayline__when pt-[18px]", lead.late && "font-medium text-destructive")}>{lead.when}</span>
        <span aria-hidden="true" className="dayline__node mt-4 size-6 text-foreground">
          <LeadIcon className="size-[15px]" />
        </span>
        {/* One grid cell: the leaving job and the next share it, so neither pushes the other. */}
        <div className="grid min-w-0 *:[grid-area:1/1]">
          <AnimatePresence initial={false}>
            <JobCard key={lead.key} job={lead} lead />
          </AnimatePresence>
        </div>
      </div>
      {then.length > 0 ? (
        <div className="dayline__row">
          <span className="dayline__when pt-[18px]">Then</span>
          <span aria-hidden="true" className="dayline__node mt-4 size-6">
            <i className="size-2 rounded-full bg-input" />
          </span>
          <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
            {then.map((job) => (
              <JobCard key={job.key} job={job} />
            ))}
          </div>
        </div>
      ) : null}
      {more > 0 ? (
        <div className="dayline__row">
          <span />
          <span />
          <Link
            to="/orders"
            className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-muted-foreground no-underline hover:text-foreground"
          >
            {more} more waiting
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      ) : null}
    </>
  )
}

function JobCard({ job, lead = false }: { job: Job; lead?: boolean }) {
  const Icon = JOB_ICON[job.kind]
  return (
    <m.article
      // The one card with an exit: it rises into the bar while the next glides from its tile into this place.
      layoutId={`job-${job.key}`}
      layout="position"
      transition={GLIDE}
      exit={{ opacity: 0, y: -56, transition: { duration: 0.24, ease: "easeIn" } }}
      className={cn(
        "rounded-xl border bg-card",
        lead
          ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 px-6 py-5 max-md:grid-cols-1 max-md:gap-y-3 max-md:p-4"
          : "flex min-h-40 flex-col p-4 max-md:grid max-md:min-h-0 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:p-3",
      )}
    >
      {lead ? null : (
        <div className="mb-2.5 flex items-center justify-between text-muted-foreground max-md:hidden">
          <Icon aria-hidden="true" className={cn("size-5", job.tone === "problem" && "text-destructive")} />
          <span className={cn("text-sm", job.late && "font-medium text-destructive")}>{job.when}</span>
        </div>
      )}
      <div className="min-w-0">
        {lead ? <p className="mb-1 text-sm font-medium text-muted-foreground">Do this next</p> : null}
        <h3 className={cn(lead ? "text-4xl leading-tight font-semibold tracking-[-.03em] max-md:text-2xl" : "font-medium")}>
          {job.title}
          {job.code ? <span className={cn("font-mono", lead ? "tracking-[-.04em]" : "text-sm font-semibold")}> {job.code}</span> : null}
        </h3>
        <p className={cn("text-muted-foreground", lead ? "mt-1 text-base" : "text-sm")}>{job.detail}</p>
      </div>
      <div className={cn(lead ? "" : "mt-auto pt-3 max-md:mt-0 max-md:pt-0")}>
        <JobAction job={job} lead={lead} />
      </div>
    </m.article>
  )
}

function JobAction({ job, lead }: { job: Job; lead: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const variant = lead ? "default" : "outline"
  const size = cn(lead ? "max-md:w-full" : "w-full max-md:w-auto")

  async function start() {
    if (!job.fulfillmentId) return
    setStarting(true)
    try {
      await transitionFulfillment(job.fulfillmentId, { to: "picking" })
      invalidateOrders(queryClient)
      await queryClient.invalidateQueries({ queryKey: todayQuery.queryKey })
      window.setTimeout(
        () => void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: job.fulfillmentId! } }),
        LEAVE_MS,
      )
    } catch (err) {
      toast(fulfillmentMutationError(err))
      invalidateOrders(queryClient)
      setStarting(false)
    }
  }

  if (job.kind === "pick") {
    return (
      <Button variant={variant} className={size} disabled={starting} onClick={() => void start()}>
        {starting ? <Loader2 className="animate-spin" /> : null}
        {job.action}
      </Button>
    )
  }
  return (
    <Button variant={variant} className={size} asChild>
      <Link to={job.href as never}>{job.action}</Link>
    </Button>
  )
}

/** The page's own shape while it reads. */
export function DayLineSkeleton() {
  return (
    <Loading label="Loading today">
      <div className="dayline">
        {[0, 1, 2].map((i) => (
          <div key={i} className="dayline__event">
            <Bone kind="small" className="ml-auto mr-2 w-14" />
            <span />
            <Bone className="w-64 max-w-full" />
          </div>
        ))}
        <div className="now-bar">
          <Bone kind="block" className="h-13 w-full rounded-[10px]" />
        </div>
        <div className="dayline__row">
          <span />
          <span />
          <div className="grid gap-2 rounded-xl border p-6">
            <Bone kind="small" className="w-24" />
            <Bone kind="title" className="w-72 max-w-full" />
            <Bone className="w-96 max-w-full" />
          </div>
        </div>
      </div>
    </Loading>
  )
}
