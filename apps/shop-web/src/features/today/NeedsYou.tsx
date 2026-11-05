import { useState } from "react"

import { useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  AlarmClock,
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardList,
  History,
  Loader2,
  PackageX,
  PencilLine,
  Play,
  ReceiptText,
  TrendingDown,
  Truck,
  Undo2,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { cn } from "@effy/design-system"
import { Button } from "@effy/design-system/ui"
import { Bone, Loading } from "@effy/web-kit/patterns"

import { BoardSection } from "@/components/console/BoardSection"
import { transitionFulfillment } from "@/features/fulfillment/repo"
import { track } from "@/lib/telemetry"

import { TIER_WORDS, tiersOf, type NeedItem, type NeedRow } from "./model"

const ICON: Record<NeedRow["id"], LucideIcon> = {
  late: AlarmClock,
  pick: ClipboardList,
  handover: Truck,
  oos: PackageX,
  refund: ReceiptText,
  low: TrendingDown,
  details: PencilLine,
  sentBack: Undo2,
  review: History,
}

/** Most urgent first, in three tiers. Rows at zero fold into one quiet "all clear" line. */
export function NeedsYou({ rows }: { rows: readonly NeedRow[] | null }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ late: true, pick: true })
  return (
    <BoardSection id="td-needs-t" tour="today.next" order={1} title="Needs you" description="Most urgent first. Each count opens the list it comes from.">
      {!rows ? (
        <NeedsYouSkeleton />
      ) : (
        tiersOf(rows).map((t) => {
          const clearLine = t.clear.length ? (
            <p className="flex items-start gap-2 pt-1 pb-2.5 text-[13px] leading-[18px] text-muted-foreground">
              <Check aria-hidden="true" className="mt-0.5 size-3.5 flex-none text-success" />
              <span>{t.clear.map((c) => c.title).join(" · ")}: all clear</span>
            </p>
          ) : null
          if (t.tier === "stop" && t.live.length === 0) {
            return (
              <div key={t.tier}>
                <p className="flex items-center gap-2.5 border-t py-3 font-medium">
                  <CircleCheck aria-hidden="true" className="size-4 text-success" />
                  Nothing to pack right now
                </p>
              </div>
            )
          }
          const quiet = rows.filter((r) => r.tier === t.tier && r.quiet && r.n > 0)
          return (
            <div key={t.tier}>
              <h3 className="border-t pt-3 pb-1.5 text-[12.5px] font-medium text-muted-foreground">{TIER_WORDS[t.tier]}</h3>
              {[...t.live.filter((r) => !r.quiet), ...quiet].map((r) => (
                <Row key={r.id} row={r} open={open[r.id] === true} onToggle={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} />
              ))}
              {clearLine}
            </div>
          )
        })
      )}
    </BoardSection>
  )
}

function Row({ row: r, open, onToggle }: { row: NeedRow; open: boolean; onToggle: () => void }) {
  const Icon = ICON[r.id]
  const foldable = r.items.length > 0
  return (
    <div className="relative">
      <Link
        to={r.to as never}
        className="-mx-2 grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-md p-2 no-underline hover:bg-row-hover"
      >
        <span
          className={cn(
            "grid size-8 place-items-center rounded-lg bg-muted [&_svg]:size-4",
            r.tier === "stop" && r.id === "late" && "bg-destructive-soft text-destructive",
            r.tier === "soon" && "bg-primary-muted text-primary",
          )}
        >
          <Icon aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{r.title}</span>
          <span className={cn("mt-px block text-[13px] leading-[18px] text-muted-foreground", r.tier === "later" && "truncate")}>{r.desc}</span>
          {r.age && !foldable ? <span className={cn("mt-0.5 block text-[12.5px] text-muted-foreground", r.old && "font-medium text-accent2")}>{r.age}</span> : null}
        </span>
        <span className="min-w-[26px] text-right text-xl leading-7 font-semibold tracking-[-0.02em] tabular-nums">{r.n}</span>
      </Link>
      {foldable ? (
        <>
          <div className="-mt-2 mb-1.5 ml-[42px] flex min-h-[26px] items-center gap-1.5">
            {r.age ? <span className={cn("block text-[12.5px] text-muted-foreground", r.old && "font-medium text-accent2")}>{r.age}</span> : null}
            <button
              type="button"
              aria-expanded={open}
              onClick={onToggle}
              className="ml-auto inline-flex h-[26px] items-center gap-1 rounded-sm px-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {open ? "Hide" : r.items.length === 1 ? "Show it" : `Show these ${r.items.length}`}
              <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform", open && "rotate-180")} />
            </button>
          </div>
          {open ? (
            <ul className="mb-2 ml-[42px] border-l">
              {r.items.map((it, i) => (
                <li key={it.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 py-1 pl-2.5">
                  <Link to={it.action.to as never} className="grid min-w-0 text-[13px] leading-[18px] no-underline hover:[&_b]:underline">
                    <b className="truncate font-mono text-[12.5px] font-semibold">{it.primary}</b>
                    <small className="truncate text-[12.5px] text-muted-foreground">{it.secondary}</small>
                  </Link>
                  <ItemAction item={it} lead={i === 0 && r.id === "pick"} />
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/** The row's own button. "Start picking" starts the pick here, then opens the order on its pick screen. */
function ItemAction({ item, lead }: { item: NeedItem; lead: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const variant = lead ? "default" : "outline"
  if (!item.action.pick) {
    return (
      <Button variant={variant} size="sm" asChild>
        <Link to={item.action.to as never}>{item.action.label}</Link>
      </Button>
    )
  }
  const id = item.action.pick
  async function start() {
    setStarting(true)
    try {
      await transitionFulfillment(id, { to: "picking" })
      track({ name: "today_attention_acted", kind: "start_picking" })
      void queryClient.invalidateQueries({ queryKey: ["shop", "today"] })
      void navigate({ to: "/orders/$fulfillmentId", params: { fulfillmentId: id } })
    } catch {
      toast("Picking couldn’t be started. Open the order and try again.")
    } finally {
      setStarting(false)
    }
  }
  return (
    <Button variant={variant} size="sm" disabled={starting} onClick={() => void start()}>
      {starting ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />}
      {item.action.label}
    </Button>
  )
}

function NeedsYouSkeleton() {
  return (
    <Loading label="Loading what needs you">
      {(["stop", "soon", "later"] as const).map((t) => (
        <div key={t}>
          <h3 className="border-t pt-3 pb-1.5 text-[12.5px] font-medium text-muted-foreground">{TIER_WORDS[t]}</h3>
          {[0, 1].map((i) => (
            <div key={i} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-x-2.5 py-2">
              <span className="size-8 rounded-lg bg-muted" />
              <span className="grid gap-1.5">
                <Bone className="h-3.5 w-36" />
                <Bone className="h-3 w-48" />
              </span>
              <Bone kind="heading" className="h-6 w-7" />
            </div>
          ))}
        </div>
      ))}
    </Loading>
  )
}
