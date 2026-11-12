import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Bell, CircleMinus, CirclePlus, Coins, History, Inbox, Mail, Send, ShoppingBag } from "lucide-react"

import { OPERATING_TZ } from "@effy/shared-types"
import { Avatar, AvatarFallback, Button } from "@effy/design-system/ui"
import { ActivityLogDrawer, useActivityAction, useActivityLog } from "@effy/web-kit/activity-log"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"

import {
  Bone,
  Callout,
  DetailPageSkeleton,
  DetailRowsSkeleton,
  ListSkeleton,
  MoreActions,
  PageHeader,
  Panel,
  PanelSkeleton,
} from "@effy/web-kit/patterns"
import { initialsOf } from "@/components/shell/identity"
import { DirectMessageDialog } from "@/features/messages/components/DirectMessageDialog"
import { MESSAGES_ROOT } from "@/features/messages/queries"
import { receivedPath } from "@/features/messages/repo"
import { sessionQuery } from "@/features/auth/queries"
import { api } from "@/lib/api"
import { money } from "@/lib/format"

import { canDebitPoints, creditIsLimited } from "./access"
import { CreditPointsSheet } from "./components/CreditPointsSheet"
import { NotificationsPanel } from "./components/NotificationsPanel"
import { DebitPointsSheet } from "./components/DebitPointsSheet"
import { formatDay, formatPoints } from "./components/points-format"
import { customerDetailQuery, customersKeys, pointsSettingsQuery } from "./queries"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

/** The erase date, in words, on Effy's clock (113). */
const eraseDate = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: OPERATING_TZ })

export function CustomerDetailScreen({ customerId }: { customerId: string }) {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const detail = useQuery(customerDetailQuery(customerId))
  useTourPage("customer", { status: tourStatus(detail) })
  const settings = useQuery(pointsSettingsQuery)
  const [crediting, setCrediting] = useState(false)
  const [debiting, setDebiting] = useState(false)
  const activity = useActivityAction()
  const { show: openLog } = useActivityLog()
  // A page has one activity drawer (104); it shows the points log or, since 111, the consent history, and since 112 the
  // messages Effy sent them.
  const [log, setLog] = useState<"points" | "consent" | "messages">("points")
  const [messaging, setMessaging] = useState(false)
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
            <Button data-tour="customer.credit" onClick={() => setCrediting(true)}>
              <CirclePlus aria-hidden="true" />
              Credit points
            </Button>
            <MoreActions tour="customer.more"
              actions={[
                { ...activity, label: "Points activity", onSelect: () => { setLog("points"); openLog() } },
                { label: "Consent history", icon: History, onSelect: () => { setLog("consent"); openLog() } },
                { label: "Send message", icon: Send, onSelect: () => setMessaging(true) },
                { label: "Messages received", icon: Inbox, onSelect: () => { setLog("messages"); openLog() } },
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

      {/* 113: a deletion in progress, and a registration that matches a barred, erased account. Staff can't restore or erase. */}
      {c.closingEraseAfter ? (
        <Callout tone="muted" title={`Being deleted: erased on ${eraseDate.format(new Date(c.closingEraseAfter))}`}>
          Signing in before then restores the account.
        </Callout>
      ) : null}
      {c.matchesErasedBarredOn ? (
        <Callout tone="info" title="Matches a barred account">
          {`Matches an account that was barred and deleted on ${eraseDate.format(new Date(`${c.matchesErasedBarredOn}T12:00:00Z`))}.`}
        </Callout>
      ) : null}

      <div className="ef-detail">
        <div className="ef-detail__main">
          <Panel tour="customer.points"
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
                <dd className="tabular-nums">{c.points.held > 0 ? formatPoints(c.points.held) : "-"}</dd>
              </div>
              <div className="ef-dl__row">
                <dt>Next to expire</dt>
                <dd className="tabular-nums">
                  {c.points.nextExpiry
                    ? `${formatPoints(c.points.nextExpiry.points)} after ${formatDay(c.points.nextExpiry.date)}`
                    : "-"}
                </dd>
              </div>
            </dl>
          </Panel>

          <NotificationsPanel customerId={c.id} />

          <Panel tour="customer.orders"
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
      {log === "points" ? (
        <ActivityLogDrawer
          key="points"
          app="back-office"
          log="bo-points"
          title="Points activity"
          description={`${c.name || c.email} - every change to the balance. Nothing is edited or deleted; a correction is a new line.`}
          api={api}
          path={`/orders/v1/customers/${c.id}/points/history`}
          queryKey={customersKeys.detail(c.id)}
          fileName={`points-${c.email}-activity`}
        />
      ) : log === "messages" ? (
        <ActivityLogDrawer
          key="messages"
          app="back-office"
          log="bo-messages-received"
          title="Messages received"
          description={`${c.name || c.email} - every message Effy sent them from Messages, and whether they opened it.`}
          api={api}
          path={receivedPath("customer", c.id)}
          queryKey={[...MESSAGES_ROOT, "received", "customer", c.id]}
          fileName={`messages-${c.email}`}
        />
      ) : (
        <ActivityLogDrawer
          key="consent"
          app="back-office"
          log="bo-customer-consent"
          title="Consent history"
          description={`${c.name || c.email} - every yes and no to offers and news, where it was given and the words they were shown. Only the customer can change it.`}
          api={api}
          path={`/orders/v1/customers/${c.id}/consent/activity`}
          queryKey={customersKeys.notifications(c.id)}
          fileName={`consent-${c.email}-history`}
        />
      )}
      <DirectMessageDialog
        audience="customer"
        id={c.id}
        name={c.name || c.email}
        open={messaging}
        onOpenChange={setMessaging}
        orders={c.recentOrders}
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
          <PanelSkeleton title="Notifications" icon={<Bell aria-hidden="true" />} description>
            <DetailRowsSkeleton labels={["Order updates", "Points", "Offers", "News", "Important", "Support"]} />
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
