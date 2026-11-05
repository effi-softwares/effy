import type { ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, type LinkProps } from "@tanstack/react-router"
import { ArrowRight, Check, ClipboardCheck, Package, PackageX, Route, Search, type LucideIcon } from "lucide-react"

import { cn } from "@effy/design-system"
import { Button } from "@effy/design-system/ui"
import type { CourierView, FleetOverviewDTO } from "@effy/shared-types"
import { Bone, Kbd, Loading } from "@effy/web-kit/patterns"

import { readinessQuery } from "@/features/drivers/queries"
import { setCommandPaletteOpen } from "@/lib/ui-store"

import { clockWords, localHours } from "./model"
import { courierCountsQuery } from "./queries"
import { CouldNotLoad, Section } from "./Section"

/** A ruled list of label and figure. */
function Rows({ children }: { children: ReactNode }) {
  return <ul className="border-t">{children}</ul>
}
function FigureRow({
  link,
  label,
  note,
  value,
  bad = false,
}: {
  link?: LinkProps
  label: string
  note?: string
  value: ReactNode
  bad?: boolean
}) {
  const cls = "flex items-baseline justify-between gap-3 border-b py-2"
  const body = (
    <>
      <span className="min-w-0 text-muted-foreground">
        {label}
        {note ? <small className="block text-[12.5px]">{note}</small> : null}
      </span>
      <b className={cn("font-medium whitespace-nowrap tabular-nums", bad && "font-semibold text-destructive")}>
        {value}
      </b>
    </>
  )
  return (
    <li>
      {link ? (
        <Link {...link} className={cn(cls, "no-underline hover:bg-row-hover")}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  )
}

function RowsSkeleton({ labels }: { labels: readonly string[] }) {
  return (
    <Loading label="Loading">
      <Rows>
        {labels.map((l) => (
          <FigureRow key={l} label={l} value={<Bone className="h-3 w-6" />} />
        ))}
      </Rows>
    </Loading>
  )
}

const COURIER: readonly [CourierView, string, boolean][] = [
  ["hub_due", "Due out of the hub", false],
  ["hub_late", "Late out of the hub", true],
  ["supplier", "Pickup from the supplier", false],
  ["with_courier", "With the courier", false],
  ["problems", "Open problems", true],
]

export function CourierParcels() {
  const c = useQuery(courierCountsQuery())
  return (
    <Section
      id="ov-cr-t"
      order={6}
      title="Courier parcels"
      description="Parcels going out with a courier, by stage."
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orders/handover">
            Open
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {c.isError ? (
        <CouldNotLoad what="courier parcels" service="orders service" />
      ) : !c.data ? (
        <RowsSkeleton labels={COURIER.map(([, l]) => l)} />
      ) : (
        <Rows>
          {COURIER.map(([v, label, alarm]) => (
            <FigureRow
              key={v}
              link={{ to: "/orders/handover", search: { view: v } } as LinkProps}
              label={label}
              value={c.data[v]}
              bad={alarm && c.data[v] > 0}
            />
          ))}
        </Rows>
      )}
    </Section>
  )
}

export function ShopsBehind({ runs, failed }: { runs: FleetOverviewDTO | undefined; failed: boolean }) {
  const shops = runs?.shopsBehind ?? []
  const at = runs?.nextRunAt ? clockWords(localHours(runs.nextRunAt)) : null
  return (
    <Section
      id="ov-sh-t"
      order={6}
      title="Shops behind"
      description={
        runs
          ? !at
            ? "No collection runs are set up."
            : shops.length
              ? `Not ready yet for the ${at} run, most first.`
              : `Every shop is ready for the ${at} run.`
          : undefined
      }
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/shops">
            Shops
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      {failed ? (
        <CouldNotLoad what="the shops" service="fleet service" />
      ) : !runs ? (
        <Loading label="Loading the shops behind">
          <ul>
            {[0, 1].map((i) => (
              <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border-t py-2.5">
                <Bone className="h-3 w-32" />
                <Bone className="h-3 w-20" />
              </li>
            ))}
          </ul>
        </Loading>
      ) : shops.length === 0 ? (
        <p className="flex items-start gap-2 border-t pt-2.5 text-[13px] text-muted-foreground">
          <Check aria-hidden="true" className="mt-0.5 size-3.5 text-success" />
          Nothing to chase
        </p>
      ) : (
        <ul>
          {shops.map((s) => (
            <li key={s.shopId}>
              <Link
                to="/shops/$shopId"
                params={{ shopId: s.shopId }}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t py-2 no-underline hover:bg-row-hover"
              >
                <span className="truncate font-medium">{s.name}</span>
                <b className="font-medium whitespace-nowrap tabular-nums">
                  {s.notReady} of {s.of} not ready
                </b>
                <span aria-hidden="true" className="col-span-2 block h-1 overflow-hidden rounded-xs bg-muted">
                  <i
                    className="block h-full bg-accent2"
                    style={{ width: `${(Number(s.notReady) / Math.max(1, Number(s.of))) * 100}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

export function FleetReadiness() {
  const r = useQuery(readinessQuery())
  const d = r.data
  const expiring = d?.expiring ?? []
  const first = expiring[0]
  return (
    <Section id="ov-rd-t" order={7} title="Fleet readiness">
      {r.isError ? (
        <CouldNotLoad what="fleet readiness" service="fleet service" />
      ) : !d ? (
        <RowsSkeleton
          labels={["Drivers who can’t get work", "Groups with no driver", "Licences and registrations expiring"]}
        />
      ) : (
        <Rows>
          <FigureRow
            link={{ to: "/drivers" }}
            label="Drivers who can’t get work"
            note={
              d.blocked.length
                ? d.blocked
                    .slice(0, 2)
                    .map((b) => b.driverName)
                    .join(", ") + (d.blocked.length > 2 ? ` +${d.blocked.length - 2}` : "")
                : undefined
            }
            value={d.blocked.length}
            bad={d.blocked.length > 0}
          />
          <FigureRow
            link={{ to: "/drivers" }}
            label="Groups with no driver"
            note={
              d.uncoveredZones.length
                ? d.uncoveredZones
                    .slice(0, 2)
                    .map((z) => z.zoneName)
                    .join(", ")
                : undefined
            }
            value={d.uncoveredZones.length}
            bad={d.uncoveredZones.length > 0}
          />
          <FigureRow
            link={{ to: "/drivers" }}
            label="Licences and registrations expiring"
            note={
              first
                ? `${first.driverName}’s ${first.kind === "licence" ? "licence" : "registration"} · ${first.expired ? "expired" : new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${first.expiresOn}T12:00:00Z`))}`
                : undefined
            }
            value={expiring.length}
            bad={expiring.some((e) => e.expired)}
          />
        </Rows>
      )}
    </Section>
  )
}

const SHORTCUTS: readonly { label: string; icon: LucideIcon; keys: string; link: LinkProps }[] = [
  { label: "Go to orders", icon: Package, keys: "G O", link: { to: "/orders" } },
  { label: "Go to dispatch", icon: Route, keys: "G D", link: { to: "/orders/assignments" } },
  { label: "Go to exceptions", icon: PackageX, keys: "G E", link: { to: "/exceptions" } },
  { label: "Review products", icon: ClipboardCheck, keys: "G R", link: { to: "/product-review" } },
]

/** The pages people go to most, with their keys. */
export function Shortcuts() {
  return (
    <Section id="ov-k-t" tour="overview.shortcuts" order={7} title="Shortcuts">
      <ul className="border-t pt-1">
        <li>
          <Button
            variant="ghost"
            className="-mx-2 w-[calc(100%+16px)] justify-start px-2 font-normal [&_svg]:text-muted-foreground"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Search aria-hidden="true" />
            Find an order or customer
            <Kbd className="ml-auto">⌘K</Kbd>
          </Button>
        </li>
        {SHORTCUTS.map((s) => (
          <li key={s.label}>
            <Button
              variant="ghost"
              className="-mx-2 w-[calc(100%+16px)] justify-start px-2 font-normal [&_svg]:text-muted-foreground"
              asChild
            >
              <Link {...s.link}>
                <s.icon aria-hidden="true" />
                {s.label}
                <Kbd className="ml-auto">{s.keys}</Kbd>
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </Section>
  )
}
