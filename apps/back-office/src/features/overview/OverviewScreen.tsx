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

import { cn } from "@effy/design-system"
import { Badge, Button } from "@effy/design-system/ui"

import { Bone, Callout, Kbd, PageHeader, Panel } from "@effy/web-kit/patterns"
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

  const exceptions = useQuery(exceptionsQuery())
  const day = useQuery(dispatchDayQuery())
  const views = useQuery(orderViewCountsQuery({}))
  const review = useQuery(reviewQueueQuery({}))
  const feedback = useQuery(feedbackListQuery({ status: "new" }))
  const deliverability = useQuery(deliverabilityListQuery({}))
  const duty = useQuery(dutyQuery())

  const ex = exceptions.data
  const open = ex?.exceptions.items.filter((e) => e.resolvedAt === null) ?? []
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
            description="Each count opens the list it comes from. They update live - nothing here refreshes on a timer."
            actions={
              <Badge variant="outline">
                <span
                  className="size-2 animate-[effy-pulse_2s_ease-in-out_infinite] rounded-full bg-success"
                  aria-hidden="true"
                />
                Live
              </Badge>
            }
            flush
          >
            <div className="divide-y">
              {attention.map((a) => (
                <Link
                  key={a.title}
                  {...a.link}
                  className="flex min-h-16 items-center gap-4 px-5 py-3 text-sm no-underline hover:bg-row-hover max-md:gap-3 max-md:px-4"
                >
                  <span
                    className={cn(
                      "grid size-9 flex-none place-items-center rounded-lg bg-muted text-foreground [&_svg]:size-4",
                      a.tile === "primary" && "bg-primary-muted text-primary",
                      a.tile === "problem" && "bg-foreground text-background",
                    )}
                  >
                    <a.icon aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-auto">
                    <span className="font-medium">{a.title}</span>
                    <span className="block text-muted-foreground">{a.desc}</span>
                  </span>
                  <span className="min-w-10 text-right text-xl leading-7 font-semibold tracking-[-0.02em] tabular-nums max-md:min-w-7 max-md:text-lg">
                    {a.n === undefined ? <Bone kind="heading" className="ml-auto h-6 w-8" /> : a.n}
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
            <ul className="space-y-1 p-2">
              <li>
                <Button
                  variant="ghost"
                  className="w-full justify-start font-normal [&_svg]:text-muted-foreground"
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
                    className="w-full justify-start font-normal [&_svg]:text-muted-foreground"
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
