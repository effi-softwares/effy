import { useState, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import { cn } from "@effy/design-system"
import { Tabs, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { STATUS_WORD, type PackageStatus } from "@effy/shared-types"
import { Bone, Loading } from "@effy/web-kit/patterns"

import { ordersTodayQuery } from "@/features/orders/queries"

import { CouldNotLoad, Section } from "./Section"

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

type Who = "all" | "effy" | "courier"

/** Every package on today's board in the nine status words, split by who delivers it. */
export function PackageFlow() {
  const [who, setWho] = useState<Who>("all")
  const today = useQuery(ordersTodayQuery())
  const p = today.data?.packages
  const count = (s: PackageStatus) =>
    p ? (who === "courier" ? 0 : Number(p.effy[s])) + (who === "effy" ? 0 : Number(p.courier[s])) : 0
  const total = FLOW.reduce((n, [s]) => n + count(s), 0)

  return (
    <Section
      id="ov-flow-t"
      order={4}
      className="@container"
      title="Where every package is"
      description="Packages sold a window today, and courier parcels still on their way."
      actions={
        <Tabs value={who} onValueChange={(v) => setWho(v as Who)}>
          <TabsList aria-label="Who delivers">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="effy">Delivered by Effy</TabsTrigger>
            <TabsTrigger value="courier">Courier delivery</TabsTrigger>
          </TabsList>
        </Tabs>
      }
    >
      {today.isError ? (
        <CouldNotLoad what="the counts" service="orders service" />
      ) : !p ? (
        <Loading label="Loading where every package is">
          <Bone className="block h-2.5 w-full rounded-sm" />
          <Columns render={() => <Bone kind="heading" className="h-5 w-8" />} />
        </Loading>
      ) : (
        <>
          <div
            role="img"
            aria-label={FLOW.map(([s]) => `${STATUS_WORD[s]} ${count(s)}`).join(", ")}
            className="flex h-2.5 gap-0.5"
          >
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
              <b
                className={cn(
                  "text-xl leading-[26px] font-semibold tracking-[-0.02em]",
                  s === "problem" && count(s) > 0 && "text-destructive",
                )}
              >
                {count(s)}
              </b>
            )}
          />
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            <span>
              {count("delivered")} of {total} delivered
            </span>
            {(() => {
              const c =
                (who === "courier" ? 0 : Number(p.effy.cancelled)) + (who === "effy" ? 0 : Number(p.courier.cancelled))
              return c ? <span>· {c} cancelled</span> : null
            })()}
            {count("problem") > 0 ? (
              <Link to="/exceptions" className="link">
                · See the problems
              </Link>
            ) : null}
          </p>
        </>
      )}
    </Section>
  )
}

function Columns({ render }: { render: (s: PackageStatus) => ReactNode }) {
  return (
    <dl className="mt-3 grid grid-cols-8 gap-px border-y bg-border @max-[640px]:grid-cols-4">
      {FLOW.map(([s, v]) => (
        <div
          key={s}
          className="grid content-start gap-0.5 bg-background px-2.5 py-2.5 first:pl-0 @max-[640px]:[&:nth-child(5)]:pl-0"
        >
          <dt className="flex min-h-8 items-start gap-1.5 text-[12.5px] leading-4 text-muted-foreground">
            <i className="ov-sw mt-[3px]" style={{ background: `var(${v})` }} />
            {STATUS_WORD[s]}
          </dt>
          <dd>{render(s)}</dd>
        </div>
      ))}
    </dl>
  )
}
