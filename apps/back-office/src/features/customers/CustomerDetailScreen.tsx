import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { CircleMinus, CirclePlus, Coins, Mail, ShoppingBag } from "lucide-react"

import { Avatar, AvatarFallback, Button } from "@effy/design-system/ui"
import { ActivityLogDrawer, useActivityAction } from "@effy/web-kit/activity-log"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"

import {
  Bone,
  DetailPageSkeleton,
  DetailRowsSkeleton,
  ListSkeleton,
  MoreActions,
  PageHeader,
  Panel,
  PanelSkeleton,
} from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"
import { sessionQuery } from "@/features/auth/queries"
import { api } from "@/lib/api"
import { money } from "@/lib/format"

import { canDebitPoints, creditIsLimited } from "./access"
import { CreditPointsSheet } from "./components/CreditPointsSheet"
import { DebitPointsSheet } from "./components/DebitPointsSheet"
import { formatDay, formatPoints } from "./components/points-format"
import { customerDetailQuery, customersKeys, pointsSettingsQuery } from "./queries"

export function CustomerDetailScreen({ customerId }: { customerId: string }) {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const detail = useQuery(customerDetailQuery(customerId))
  const settings = useQuery(pointsSettingsQuery)
  const [crediting, setCrediting] = useState(false)
  const [debiting, setDebiting] = useState(false)
  const activity = useActivityAction()
  useHeaderDetail(detail.data ? detail.data.name || detail.data.email : null)

  if (detail.isError) return <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
  if (detail.isPending) return <CustomerSkeleton />

  const c = detail.data
  const centsPerPoint = settings.data?.centsPerPoint ?? 1
  const limit = creditIsLimited(roles) ? (settings.data?.csaCreditLimitPoints ?? null) : null
  const mayDebit = canDebitPoints(roles)

  return (
    <>
      <PageHeader
        back={{ label: "Customers", link: { to: "/customers" } }}
        title={c.name || c.email}
        meta={
          <>
            <span>
              <Mail aria-hidden="true" />
              {c.email}
            </span>
            <span>
              <ShoppingBag aria-hidden="true" />
              {c.recentOrders.length} recent {c.recentOrders.length === 1 ? "order" : "orders"}
            </span>
          </>
        }
        actions={
          <>
            <Button onClick={() => setCrediting(true)}>
              <CirclePlus aria-hidden="true" />
              Credit points
            </Button>
            <MoreActions
              actions={[
                { ...activity, label: "Points activity" },
                mayDebit
                  ? {
                      label: "Remove points…",
                      icon: CircleMinus,
                      onSelect: () => setDebiting(true),
                      disabled: c.points.usable === 0,
                      hint: "Nothing to remove",
                    }
                  : null,
              ]}
            />
          </>
        }
      />

      <div className="ef-detail">
        <div className="ef-detail__main">
          <Panel
            title="Points"
            icon={<Coins aria-hidden="true" />}
            description="Points are a way of paying, never a discount. The balance is worked out from the ledger, never stored."
          >
            <dl className="ef-dl">
              <div className="ef-dl__row">
                <dt>Usable</dt>
                <dd>
                  <span className="text-xl font-semibold tabular-nums">{formatPoints(c.points.usable)}</span>{" "}
                  <span className="text-muted-foreground">· {money(c.points.valueAmount)}</span>
                </dd>
              </div>
              <div className="ef-dl__row">
                <dt>Held at checkout</dt>
                <dd className="tabular-nums">{c.points.held > 0 ? formatPoints(c.points.held) : "—"}</dd>
              </div>
              <div className="ef-dl__row">
                <dt>Next to expire</dt>
                <dd className="tabular-nums">
                  {c.points.nextExpiry
                    ? `${formatPoints(c.points.nextExpiry.points)} after ${formatDay(c.points.nextExpiry.date)}`
                    : "—"}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel
            title="Recent orders"
            icon={<ShoppingBag aria-hidden="true" />}
            description="Every change to the points balance is under Points activity."
            flush
          >
            {c.recentOrders.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {c.recentOrders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <Link to="/orders/$orderId" params={{ orderId: o.id }} className="link font-mono">
                      {o.orderNumber}
                    </Link>
                    <span className="text-sm tabular-nums">{money(o.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <aside className="ef-detail__aside is-first">
          <Panel title="Customer">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar aria-hidden="true" className="size-12">
                  <AvatarFallback className="text-base bg-primary-muted text-primary">
                    {initialsOf(c.name || c.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate font-semibold">{c.name || c.email}</div>
                  <div className="mt-0.5 block text-sm text-muted-foreground truncate">{c.email}</div>
                </div>
              </div>
              <div className="grid gap-2">
                <Button onClick={() => setCrediting(true)}>
                  <CirclePlus aria-hidden="true" />
                  Credit points
                </Button>
                {mayDebit ? (
                  <Button variant="outline" onClick={() => setDebiting(true)} disabled={c.points.usable === 0}>
                    <CircleMinus aria-hidden="true" />
                    Remove points
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {limit !== null ? `You can credit up to ${formatPoints(limit)} points at once. ` : ""}
                Removing points needs a manager or an administrator.
              </p>
            </div>
          </Panel>
        </aside>
      </div>

      <CreditPointsSheet
        open={crediting}
        onOpenChange={setCrediting}
        customerId={c.id}
        customerName={c.name || c.email}
        orders={c.recentOrders}
        limit={limit}
        centsPerPoint={centsPerPoint}
      />
      {mayDebit ? (
        <DebitPointsSheet
          open={debiting}
          onOpenChange={setDebiting}
          customerId={c.id}
          customerName={c.name || c.email}
          usable={c.points.usable}
          centsPerPoint={centsPerPoint}
        />
      ) : null}
      <ActivityLogDrawer
        app="back-office"
        log="bo-points"
        title="Points activity"
        description={`${c.name || c.email} — every change to the balance. Nothing is edited or deleted; a correction is a new line.`}
        api={api}
        path={`/orders/v1/customers/${c.id}/points/history`}
        queryKey={customersKeys.detail(c.id)}
        fileName={`points-${c.email}-activity`}
      />
    </>
  )
}

function CustomerSkeleton() {
  return (
    <DetailPageSkeleton
      back={{ label: "Customers", link: { to: "/customers" } }}
      actions={2}
      asideFirst
      main={
        <>
          <PanelSkeleton title="Points" icon={<Coins aria-hidden="true" />} description>
            <DetailRowsSkeleton labels={["Usable", "Held at checkout", "Next to expire"]} />
          </PanelSkeleton>
          <PanelSkeleton title="Recent orders" icon={<ShoppingBag aria-hidden="true" />} description flush>
            <ListSkeleton rows={3} lines={1} trailing="text" inset />
          </PanelSkeleton>
        </>
      }
      aside={
        <PanelSkeleton title="Customer">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Bone kind="avatar" className="size-12" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Bone className="w-32" />
                <Bone kind="small" className="w-44" />
              </div>
            </div>
            <Bone kind="control" />
          </div>
        </PanelSkeleton>
      }
    />
  )
}
