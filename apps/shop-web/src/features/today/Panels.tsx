import { useState, type ReactNode } from "react"

import { Link } from "@tanstack/react-router"
import { ArrowRight, BarChart3, ClipboardList, Package, Printer, ScanLine, type LucideIcon } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button, Tabs, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { DELIVERED_BY_WORDS, STATUS_WORD, type PackageStatus, type ShopTodayDTO } from "@effy/shared-types"
import { Bone, Loading } from "@effy/web-kit/patterns"

import { BoardSection } from "@/components/console/BoardSection"

import { clock, eventWords, formatAge, plural } from "./model"

// ---- being picked now -----------------------------------------------------------------------------------------------

/** Who is picking what, and for which driver. */
export function PickingNow({ today, now }: { today: ShopTodayDTO | undefined; now: number }) {
  const list = today?.picking ?? []
  return (
    <BoardSection
      id="td-pick-t"
      tour="today.picking"
      order={3}
      title="Being picked now"
      description={today ? (list.length ? `${plural(list.length, "order")} on the go` : "Nobody is picking right now.") : undefined}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orders" search={{ tab: "picking" } as never}>
            Orders
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {!today ? (
        <Loading label="Loading who is picking">
          <ul className="border-t">
            {[0, 1].map((i) => (
              <li key={i} className="flex items-center gap-2.5 border-b py-2.5">
                <span className="size-8 rounded-full bg-muted" />
                <span className="grid flex-1 gap-1.5">
                  <Bone className="h-3 w-24" />
                  <Bone className="h-3 w-40" />
                </span>
              </li>
            ))}
          </ul>
        </Loading>
      ) : list.length === 0 ? null : (
        <ul className="border-t">
          {list.map((p) => {
            const mins = Math.floor((now - new Date(p.startedAt).getTime()) / 60_000)
            return (
              <li key={p.fulfillmentId}>
                <Link
                  to="/orders/$fulfillmentId"
                  params={{ fulfillmentId: p.fulfillmentId }}
                  className="flex items-center gap-2.5 border-b py-2.5 no-underline hover:bg-row-hover"
                >
                  <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {initials(p.picker)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block font-mono text-[13px] font-semibold">{p.orderNumber}</b>
                    <small className="block truncate text-[12.5px] text-muted-foreground">
                      {p.picker ?? "Started on another screen"} · {plural(p.units, "item")} ·{" "}
                      {p.runAt ? `for the ${clock(p.runAt, today.timezone)} driver` : DELIVERED_BY_WORDS[p.deliveredBy]}
                    </small>
                  </span>
                  <span className={cn("text-[13px] whitespace-nowrap tabular-nums", mins > 20 ? "font-medium text-accent2" : "text-muted-foreground")}>
                    {formatAge(p.startedAt, now)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </BoardSection>
  )
}

const initials = (name: string | null) =>
  name
    ? name
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?"

// ---- where today's orders are ---------------------------------------------------------------------------------------

/** The eight words a package moves through, in order; Cancelled is counted under the bar. */
const FLOW: readonly [PackageStatus, string][] = [
  ["preparing", "--pkg-preparing"],
  ["ready", "--pkg-ready"],
  ["with_driver", "--pkg-with-driver"],
  ["at_hub", "--pkg-at-hub"],
  ["out_for_delivery", "--pkg-out"],
  ["with_carrier", "--pkg-carrier"],
  ["delivered", "--pkg-delivered"],
  ["problem", "--pkg-problem"],
]

type Who = "all" | "effy_driver" | "courier"

/** Every order that came in today, after it leaves your hands too, in the nine status words. */
export function OrdersFlow({ today }: { today: ShopTodayDTO | undefined }) {
  const [who, setWho] = useState<Who>("all")
  const p = today?.packages
  const count = (s: PackageStatus) => (p ? (who === "courier" ? 0 : p.effy_driver[s]) + (who === "effy_driver" ? 0 : p.courier[s]) : 0)
  const total = FLOW.reduce((n, [s]) => n + count(s), 0)
  return (
    <BoardSection
      id="td-flow-t"
      tour="today.flow"
      order={4}
      className="@container"
      title="Where today’s orders are"
      description="Every order that came in today, after it leaves your hands too."
      actions={
        <Tabs value={who} onValueChange={(v) => setWho(v as Who)}>
          <TabsList aria-label="Who takes them">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="effy_driver">{DELIVERED_BY_WORDS.effy_driver}</TabsTrigger>
            <TabsTrigger value="courier">{DELIVERED_BY_WORDS.courier}</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {!p ? (
        <Loading label="Loading where today’s orders are">
          <Bone className="block h-2.5 w-full rounded-sm" />
          <Columns render={() => <Bone kind="heading" className="h-5 w-8" />} />
        </Loading>
      ) : (
        <>
          <div role="img" aria-label={FLOW.map(([s]) => `${STATUS_WORD[s]} ${count(s)}`).join(", ")} className="flex h-2.5 gap-0.5">
            {total === 0 ? (
              <i className="block flex-1 rounded-sm bg-muted" />
            ) : (
              FLOW.filter(([s]) => count(s) > 0).map(([s, v]) => (
                <i
                  key={s}
                  title={`${STATUS_WORD[s]}: ${count(s)}`}
                  className="block min-w-[3px] first:rounded-l-sm last:rounded-r-sm"
                  style={{ flex: count(s), background: `var(${v})` }}
                />
              ))
            )}
          </div>
          <Columns
            render={(s) => (
              <b className={cn("text-xl leading-[26px] font-semibold tracking-[-0.02em]", s === "problem" && count(s) > 0 && "text-destructive")}>{count(s)}</b>
            )}
          />
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <span>
              {count("delivered")} of {total} delivered
            </span>
            {(() => {
              const c = (who === "courier" ? 0 : p.effy_driver.cancelled) + (who === "effy_driver" ? 0 : p.courier.cancelled)
              return c ? <span>· {c} cancelled</span> : null
            })()}
          </p>
        </>
      )}
    </BoardSection>
  )
}

function Columns({ render }: { render: (s: PackageStatus) => ReactNode }) {
  return (
    <dl className="mt-3 grid grid-cols-8 gap-px border-y bg-border @max-[640px]:grid-cols-4">
      {FLOW.map(([s, v]) => (
        <div key={s} className="grid content-start gap-0.5 bg-background px-2.5 py-2.5 first:pl-0 @max-[640px]:[&:nth-child(5)]:pl-0">
          <dt className="flex min-h-8 items-start gap-1.5 text-[12.5px] leading-4 text-muted-foreground">
            <i className="ef-sw mt-[3px]" style={{ background: `var(${v})` }} />
            {STATUS_WORD[s]}
          </dt>
          <dd>{render(s)}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---- selling today --------------------------------------------------------------------------------------------------

export function SellingToday({ today }: { today: ShopTodayDTO | undefined }) {
  const list = today?.selling ?? []
  return (
    <BoardSection
      id="td-sell-t"
      title="Selling today"
      description={today ? (list.length ? "Most sold today, with what you have left." : "Nothing sold yet today.") : undefined}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/insights/products">
            Products
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {!today ? (
        <Loading label="Loading what is selling">
          <ul className="border-t">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex justify-between border-b py-2.5">
                <Bone className="h-3 w-32" />
                <Bone className="h-3 w-12" />
              </li>
            ))}
          </ul>
        </Loading>
      ) : (
        <ul className="border-t">
          {list.map((s) => {
            const out = s.stockLeft === 0
            return (
              <li key={s.productId}>
                <Link
                  to="/catalog/$productId"
                  params={{ productId: s.productId }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b py-2.5 no-underline hover:bg-row-hover"
                >
                  <span className="truncate font-medium">{s.name}</span>
                  <b className="font-medium whitespace-nowrap tabular-nums">{s.units} sold</b>
                  <small className={cn("col-span-2 text-[12.5px] text-muted-foreground", out && "font-medium text-destructive")}>
                    {s.stockLeft === null ? "Stock not counted" : out ? "Out of stock" : `${s.stockLeft} left`}
                  </small>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </BoardSection>
  )
}

// ---- just happened --------------------------------------------------------------------------------------------------

export function JustHappened({ today, onActivity }: { today: ShopTodayDTO | undefined; onActivity: () => void }) {
  const list = today?.events.slice(0, 5) ?? []
  return (
    <BoardSection
      id="td-events-t"
      tour="today.now"
      title="Just happened"
      actions={
        <Button variant="ghost" size="sm" onClick={onActivity}>
          Team activity
          <ArrowRight aria-hidden="true" />
        </Button>
      }
    >
      {!today ? (
        <Loading label="Loading what just happened">
          <ol className="border-t">
            {[0, 1, 2].map((i) => (
              <li key={i} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 border-b py-2">
                <Bone className="h-3 w-12" />
                <Bone className="h-3 w-40" />
              </li>
            ))}
          </ol>
        </Loading>
      ) : list.length === 0 ? (
        <p className="border-t py-3 text-sm text-muted-foreground">
          Nothing yet today.
          {today.yesterday ? ` Yesterday closed with ${plural(today.yesterday.orders, "order")}.` : ""}
        </p>
      ) : (
        <ol className="border-t">
          {list.map((e) => {
            const w = eventWords(e)
            return (
              <li key={e.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5 border-b py-2 text-[13.5px]">
                <time dateTime={e.at} className="pt-px text-[12.5px] text-muted-foreground tabular-nums">
                  {clock(e.at, today.timezone)}
                </time>
                <span className="min-w-0">
                  {w.code ? <b className="font-mono text-[13px] font-semibold">{w.code}</b> : null} {w.words}
                  {w.note ? <small className="ml-1 text-[12.5px] text-muted-foreground">{w.note}</small> : null}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </BoardSection>
  )
}

// ---- shortcuts ------------------------------------------------------------------------------------------------------

const SHORTCUTS: readonly { label: string; note: string; icon: LucideIcon; to: string }[] = [
  { label: "Orders", note: "The queue, by stage", icon: ClipboardList, to: "/orders" },
  { label: "Catalog", note: "Products, sizes and stock", icon: Package, to: "/catalog" },
  { label: "Availability", note: "What is out or running low", icon: ScanLine, to: "/catalog/availability" },
  { label: "Insights", note: "How your week is going", icon: BarChart3, to: "/insights" },
]

export function Shortcuts({ onPrint, canPrint }: { onPrint: () => void; canPrint: boolean }) {
  return (
    <BoardSection id="td-keys-t" tour="today.shortcuts" order={7} title="Shortcuts" className="max-md:hidden">
      <ul className="border-t pt-1">
        <li>
          <Button
            variant="ghost"
            disabled={!canPrint}
            className="-mx-2 w-[calc(100%+16px)] justify-start px-2 font-normal [&_svg]:text-muted-foreground"
            onClick={onPrint}
          >
            <Printer aria-hidden="true" />
            Print pick lists
            <span className="ml-auto text-[12.5px] text-muted-foreground">Every order waiting, in walking order</span>
          </Button>
        </li>
        {SHORTCUTS.map((s) => (
          <li key={s.label}>
            <Button variant="ghost" className="-mx-2 w-[calc(100%+16px)] justify-start px-2 font-normal [&_svg]:text-muted-foreground" asChild>
              <Link to={s.to as never}>
                <s.icon aria-hidden="true" />
                {s.label}
                <span className="ml-auto text-[12.5px] text-muted-foreground">{s.note}</span>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </BoardSection>
  )
}
