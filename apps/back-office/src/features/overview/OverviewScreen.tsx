import { useQuery } from "@tanstack/react-query"
import { Link, type LinkProps } from "@tanstack/react-router"
import {
  type LucideIcon,
  ChevronRight,
  ClipboardCheck,
  Hourglass,
  MailWarning,
  MessageSquareText,
  Package,
  PackageX,
  ReceiptText,
  Route,
  Search,
  ShieldAlert,
  UserX,
} from "lucide-react"

import { Button, Skeleton } from "@effy/design-system/ui"

import { Kbd, PageHeader, Panel, Callout } from "@effy/web-kit/patterns"
import { displayName } from "@/components/shell/identity"
import { sessionQuery } from "@/features/auth/queries"
import { deliverabilityListQuery } from "@/features/deliverability/queries"
import { dispatchDayQuery } from "@/features/dispatch/queries"
import { dutyQuery } from "@/features/drivers/queries"
import { exceptionsQuery } from "@/features/exceptions/queries"
import { feedbackListQuery } from "@/features/feedback/queries"
import { orderViewCountsQuery } from "@/features/orders/queries"
import { reviewQueueQuery } from "@/features/product-review/queries"
import { setCommandPaletteOpen } from "@/lib/ui-store"
import { dateLine, greeting } from "./overviewFormat"
import { TodaysWindows } from "./TodaysWindows"
import { OnDuty } from "./OnDuty"
import { OrdersToday } from "./OrdersToday"

export function OverviewScreen() {
  const session = useQuery(sessionQuery)
  const email = session.data?.status === "signed-in" ? session.data.identity.email : ""
  const first = displayName(email).split(" ")[0] ?? ""

  const exceptions = useQuery(exceptionsQuery(false))
  const day = useQuery(dispatchDayQuery())
  const views = useQuery(orderViewCountsQuery({}))
  const review = useQuery(reviewQueueQuery({}))
  const feedback = useQuery(feedbackListQuery({ status: "new", limit: 1 }))
  const deliverability = useQuery(deliverabilityListQuery({ limit: 1 }))
  const duty = useQuery(dutyQuery())

  const ex = exceptions.data
  const open = ex?.exceptions.filter((e) => e.resolvedAt === null) ?? []
  const withDrivers = open.filter((e) => e.packageLocation === "with_driver").length
  const unsafe = ex?.vehicleChecks?.filter((c) => c.unsafe && c.clearedAt === null) ?? []
  const waitingTotal =
    Number(duty.data?.unassigned.readyToCollect ?? 0) + Number(duty.data?.unassigned.readyToDeliver ?? 0)
  const nobodyOnDuty = duty.data !== undefined && duty.data.onDuty.length === 0 && waitingTotal > 0

  const attention: AttentionRow[] = [
    {
      n: ex ? open.length : undefined,
      title: "Failed deliveries",
      desc: `${withDrivers} still with drivers · ${open.length - withDrivers} back at the hub, waiting for a decision`,
      icon: PackageX,
      tile: "problem",
      link: { to: "/exceptions" },
    },
    {
      n: ex ? unsafe.length : undefined,
      title: unsafe.length === 1 ? "Vehicle found unsafe" : "Vehicles found unsafe",
      desc: unsafe.length
        ? `${unsafe.map((c) => c.driverName).join(", ")} can’t be given work until it is cleared`
        : "Nothing waiting to be cleared",
      icon: ShieldAlert,
      tile: "problem",
      link: { to: "/exceptions" },
    },
    {
      n: day.data?.unassigned.length,
      title: "Packages need a driver",
      desc: "Ready at a shop or waiting at the hub, and nobody can take them yet",
      icon: UserX,
      tile: "primary",
      link: { to: "/orders/assignments" },
    },
    {
      n: ex ? (ex.overdue?.length ?? 0) + (ex.held?.length ?? 0) : undefined,
      title: "Runs waiting on their next step",
      desc: "Overdue steps, and packages a driver declared missing",
      icon: Hourglass,
      tile: "primary",
      link: { to: "/exceptions" },
    },
    {
      n: views.data?.refundDecision,
      title: "Refund decisions",
      desc: "Customers asked for a refund, or a shop recorded items as not supplied",
      icon: ReceiptText,
      link: { to: "/orders", search: { view: "refund" } } as LinkProps,
    },
    {
      n: review.data?.total,
      title: "Products waiting for review",
      desc: "New products and changes from shops, oldest first",
      icon: ClipboardCheck,
      link: { to: "/product-review" },
    },
    {
      n: feedback.data?.total,
      title: "New feedback",
      desc: "Submitted by customers and not yet looked at",
      icon: MessageSquareText,
      link: { to: "/feedback" },
    },
    {
      n: deliverability.data?.total,
      title: "Undeliverable email addresses",
      desc: "They receive no sign-in codes until someone repairs them",
      icon: MailWarning,
      link: { to: "/deliverability" },
    },
  ]

  return (
    <>
      <PageHeader
        title={first ? `${greeting()}, ${first}` : greeting()}
        description={`${dateLine.format(new Date())} · What needs attention now, and how today's deliveries are going.`}
        actions={
          <>
            <Button variant="outline" onClick={() => setCommandPaletteOpen(true)}>
              <Search aria-hidden="true" />
              Find an order
              <Kbd>⌘K</Kbd>
            </Button>
            <Button asChild>
              <Link to="/orders/assignments">
                <Route aria-hidden="true" />
                Open dispatch
              </Link>
            </Button>
          </>
        }
      />

      {nobodyOnDuty ? (
        <Callout tone="destructive" title={`Nobody is on duty, and ${waitingTotal} packages are waiting for a driver.`}>
          Nothing will move until someone goes on duty in the driver app. Back-office can't put a driver on duty.
        </Callout>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-6 xl:col-span-2">
          <Panel
            title="Needs attention"
            description="Each count opens the list it comes from. They update live — nothing here refreshes on a timer."
            actions={
              <span className="ef-tag">
                <span
                  className="size-2 animate-[effy-pulse_2s_ease-in-out_infinite] rounded-full bg-success"
                  aria-hidden="true"
                />
                Live
              </span>
            }
            flush
          >
            <div>
              {attention.map((a) => (
                <Link key={a.title} {...a.link} className="ef-attn">
                  <span className={`ef-icon-tile${a.tile ? ` ef-icon-tile--${a.tile}` : ""}`}>
                    <a.icon aria-hidden="true" />
                  </span>
                  <span className="ef-attn__text">
                    <span className="ef-attn__title">{a.title}</span>
                    <span className="ef-attn__desc block">{a.desc}</span>
                  </span>
                  <span className="min-w-10 text-right text-2xl leading-7 font-semibold tracking-[-0.02em] tabular-nums max-md:min-w-7 max-md:text-lg">
                    {a.n === undefined ? <Skeleton className="ml-auto h-6 w-8" /> : a.n}
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </Panel>

          <TodaysWindows />
        </div>

        <div className="min-w-0 space-y-6">
          <OnDuty />
          <Panel title="Shortcuts" flush>
            <ul className="space-y-1 px-5 py-2">
              <li>
                <button type="button" className="ef-cmd-item" onClick={() => setCommandPaletteOpen(true)}>
                  <Search aria-hidden="true" />
                  Find an order or customer
                  <Kbd className="ml-auto">⌘K</Kbd>
                </button>
              </li>
              {SHORTCUTS.map((s) => (
                <li key={s.label}>
                  <Link {...s.link} className="ef-cmd-item">
                    <s.icon aria-hidden="true" />
                    {s.label}
                    <Kbd className="ml-auto">{s.keys}</Kbd>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          <OrdersToday />
        </div>
      </div>
    </>
  )
}

interface AttentionRow {
  n: number | string | undefined
  title: string
  desc: string
  icon: LucideIcon
  tile?: "problem" | "primary"
  link: LinkProps
}

const SHORTCUTS: readonly { label: string; icon: LucideIcon; keys: string; link: LinkProps }[] = [
  { label: "Go to orders", icon: Package, keys: "G O", link: { to: "/orders" } },
  { label: "Go to dispatch", icon: Route, keys: "G D", link: { to: "/orders/assignments" } },
  { label: "Go to exceptions", icon: PackageX, keys: "G E", link: { to: "/exceptions" } },
  { label: "Review products", icon: ClipboardCheck, keys: "G R", link: { to: "/product-review" } },
]
