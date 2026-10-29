import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { CalendarDays, Pencil, TicketPercent, Trash2 } from "lucide-react"

import type { PromotionAction } from "@effy/shared-types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Skeleton,
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import { ActivityLogDrawer, useActivityAction } from "@effy/web-kit/activity-log"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"

import { Callout, DetailRows, MoreActions, PageHeader, Panel } from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"
import { api } from "@/lib/api"
import { track } from "@/lib/telemetry"

import { canManagePromotions } from "./access"
import { ChosenCustomers } from "./components/ChosenCustomers"
import { CodesPanel } from "./components/CodesPanel"
import { PicturesSection } from "./components/PicturesSection"
import { PerformancePanel } from "./components/PerformancePanel"
import { promotionMutationError } from "./errorText"
import { usesLabel, type Promotion } from "./model"
import { activeDates, PromotionStateWord } from "./PromotionsListScreen"
import { PROMO_ROOT, promotionQuery, useDeletePromotion, usePromotionAction } from "./queries"

const timeFmt = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Australia/Melbourne",
})
const formatTime = (iso: string | null) => (iso ? timeFmt.format(new Date(iso)) : "—")

const CONFIRM: Record<PromotionAction, { title: string; body: string; verb: string } | null> = {
  publish: null,
  resume: null,
  pause: {
    title: "Pause this promotion?",
    body: "It stops applying and leaves every place it is shown at once. Orders already placed keep their discount. You can resume it.",
    verb: "Pause",
  },
  end: {
    title: "End this promotion now?",
    body: "It stops for good. Orders already placed keep their discount. To run it again, create a new one.",
    verb: "End now",
  },
  archive: {
    title: "Archive this promotion?",
    body: "It ends, leaves every group and is hidden from the list. Every order that used it still names it.",
    verb: "Archive",
  },
}

export function PromotionDetailScreen({ promoId }: { promoId: string }) {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canManage = canManagePromotions(roles)
  const navigate = useNavigate()
  const { data: p, error, isPending, isError, refetch } = useQuery(promotionQuery(promoId))
  const act = usePromotionAction(promoId)
  const del = useDeletePromotion()
  const [confirming, setConfirming] = useState<PromotionAction | "delete" | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const activity = useActivityAction()
  useHeaderDetail(p?.name ?? null)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60" />
      </div>
    )
  }

  const run = (action: PromotionAction) => {
    setActionError(null)
    act.mutate(action, {
      onSuccess: () => {
        track({ name: "promotion_action", promotionId: promoId, action })
        setConfirming(null)
      },
      onError: (e) => setActionError(promotionMutationError(e)),
    })
  }
  const ask = (action: PromotionAction) => (CONFIRM[action] ? setConfirming(action) : run(action))
  const moves: { action: PromotionAction; label: string }[] = [
    ...(p.state === "draft" ? [{ action: "publish" as const, label: "Publish" }] : []),
    ...(p.state === "paused" ? [{ action: "resume" as const, label: "Resume" }] : []),
    ...(["active", "scheduled", "used_up", "out_of_budget"].includes(p.state)
      ? [{ action: "pause" as const, label: "Pause" }]
      : []),
    ...(!["draft", "ended", "archived"].includes(p.state) ? [{ action: "end" as const, label: "End now" }] : []),
    ...(p.state !== "archived" ? [{ action: "archive" as const, label: "Archive" }] : []),
  ]

  return (
    <>
      <PageHeader
        back={{ label: "Promotions", link: { to: "/promotions" } }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.name}
            <PromotionStateWord state={p.state} />
          </span>
        }
        meta={
          <>
            <span>
              <TicketPercent aria-hidden="true" />
              {p.gives}
            </span>
            <span>
              <CalendarDays aria-hidden="true" />
              {activeDates(p.startsAt, p.endsAt)} (Melbourne)
            </span>
            <span>{usesLabel(p)}</span>
          </>
        }
        actions={
          // Anyone who reads the promotion reads its activity; the rest is for those who manage it.
          !canManage ? (
            <MoreActions actions={[activity]} />
          ) : (
            <>
              {p.state !== "archived" ? (
                <Button variant="outline" asChild>
                  <Link to="/promotions/$promoId/edit" params={{ promoId: p.id }}>
                    <Pencil aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
              ) : null}
              {moves[0] ? (
                <Button
                  variant={moves[0].action === "publish" || moves[0].action === "resume" ? "default" : "outline"}
                  disabled={act.isPending}
                  onClick={() => ask(moves[0]!.action)}
                >
                  {moves[0].label}
                </Button>
              ) : null}
              <MoreActions
                actions={[
                  activity,
                  ...moves.slice(1).map((m) => ({
                    label: m.label,
                    disabled: act.isPending,
                    onSelect: () => ask(m.action),
                  })),
                  !p.used
                    ? { label: "Delete", icon: Trash2, destructive: true, onSelect: () => setConfirming("delete") }
                    : null,
                ]}
              />
            </>
          )
        }
      />

      <ActivityLogDrawer
        app="back-office"
        log="bo-promotion"
        title="Promotion activity"
        description={`${p.name} — every change to it: its details, status, pictures, customers and codes.`}
        api={api}
        path={`/admin/v1/promotions/${p.id}/audit`}
        queryKey={[...PROMO_ROOT, "detail", p.id]}
        fileName={`promotion-${p.name}-activity`}
      />

      {actionError ? (
        <Callout tone="destructive" title="That didn't work">
          {actionError}
        </Callout>
      ) : null}
      {p.used ? (
        <Callout tone="info" title={`Used on ${p.uses} order${p.uses === 1 ? "" : "s"} · $${p.given} given.`}>
          What it gives and who it is for are fixed, so every order keeps explaining its discount. Its dates, limits,
          words and groups can still change.
        </Callout>
      ) : null}

      <div className="ef-detail">
        <div className="ef-detail__main">
          <Tabs defaultValue="overview">
            <div className="ef-tabsbar">
              <div className="ef-tabsbar__list">
                <TabsList aria-label="Promotion sections">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="groups">
                    Shown in
                    <TabsCount>{p.groups.length}</TabsCount>
                  </TabsTrigger>
                  <TabsTrigger value="pictures">
                    Pictures
                    <TabsCount>{p.images.length}</TabsCount>
                  </TabsTrigger>
                  {p.audience === "chosen" ? (
                    <TabsTrigger value="customers">
                      Customers
                      <TabsCount>{p.chosenCustomerCount}</TabsCount>
                    </TabsTrigger>
                  ) : null}
                  {p.trigger === "code" ? (
                    <TabsTrigger value="codes">
                      Codes
                      <TabsCount>{p.singleUseCodeCount}</TabsCount>
                    </TabsTrigger>
                  ) : null}
                </TabsList>
              </div>
            </div>
            <TabsContent value="overview" className="ef-tabpanel">
              <PerformancePanel promotionId={p.id} />
              <Overview p={p} />
            </TabsContent>
            {p.audience === "chosen" ? (
              <TabsContent value="customers" className="ef-tabpanel">
                <ChosenCustomers promotionId={p.id} canManage={canManage} />
              </TabsContent>
            ) : null}
            {p.trigger === "code" ? (
              <TabsContent value="codes" className="ef-tabpanel">
                <CodesPanel promotionId={p.id} canManage={canManage} />
              </TabsContent>
            ) : null}
            <TabsContent value="groups" className="ef-tabpanel">
              <Panel
                title="Shown in"
                description="Each group is a place the customer website and app show promotions, in the group's order."
                flush
              >
                {p.groups.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted-foreground">
                    Not shown anywhere. It still applies in the cart.
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {p.groups.map((g) => (
                      <li key={g.id} className="flex items-center justify-between gap-3 px-5 py-3">
                        <div>
                          <Link to="/promotions/groups/$groupId" params={{ groupId: g.id }} className="link">
                            {g.name}
                          </Link>
                          <div className="mt-0.5 block text-sm text-muted-foreground font-mono">{g.key}</div>
                        </div>
                        <span className="mt-0.5 block text-sm text-muted-foreground">Position {g.position + 1}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </TabsContent>
            <TabsContent value="pictures" className="ef-tabpanel">
              <PicturesSection promotion={p} canManage={canManage} />
            </TabsContent>
          </Tabs>
        </div>
        <aside className="ef-detail__aside is-first">
          <Panel title="What shoppers read">
            <div className="space-y-2">
              {p.label ? (
                <div className="mt-0.5 block text-sm text-muted-foreground font-semibold uppercase tracking-wide">
                  {p.label}
                </div>
              ) : null}
              <div className="text-base font-semibold">
                {p.headline ?? <span className="text-muted-foreground">No headline — not shown in groups</span>}
              </div>
              {p.supportingLine ? (
                <p className="mt-0.5 block text-sm text-muted-foreground">{p.supportingLine}</p>
              ) : null}
              {p.sharedCode ? <div className="font-mono">{p.sharedCode}</div> : null}
              {p.terms ? <p className="mt-0.5 block text-sm text-muted-foreground">{p.terms}</p> : null}
            </div>
          </Panel>
          <Panel title="Attribution">
            <DetailRows
              tight
              rows={[
                { label: "Created", value: formatTime(p.createdAt) },
                { label: "By", value: <span className="font-mono text-xs">{p.createdBy}</span> },
                { label: "Published", value: formatTime(p.publishedAt) },
                { label: "Last updated", value: formatTime(p.updatedAt) },
              ]}
            />
          </Panel>
        </aside>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => (o ? null : setConfirming(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "delete" ? "Delete this promotion?" : confirming ? CONFIRM[confirming]?.title : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "delete"
                ? "Nobody has used it, so removing it changes no order. This cannot be undone."
                : confirming
                  ? CONFIRM[confirming]?.body
                  : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirming === "delete"
                  ? del.mutate(promoId, {
                      onSuccess: () => void navigate({ to: "/promotions" }),
                      onError: (e) => setActionError(promotionMutationError(e)),
                    })
                  : confirming && run(confirming)
              }
            >
              {confirming === "delete" ? "Delete" : confirming ? CONFIRM[confirming]?.verb : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

const WHO: Record<Promotion["audience"], string> = {
  everyone: "Everyone",
  first_order: "A customer's first order",
  new_customers: "New customers",
  chosen: "Chosen customers",
}

function Overview({ p }: { p: Promotion }) {
  const none = <span className="text-muted-foreground">—</span>
  return (
    <>
      <Panel title="What it gives">
        <DetailRows
          rows={[
            { label: "Gives", value: p.gives },
            {
              label: "Applies",
              value:
                p.trigger === "code" ? (
                  <>
                    With the code{" "}
                    <span className="font-mono">{p.sharedCode ?? `${p.singleUseCodeCount} single-use codes`}</span>
                  </>
                ) : (
                  "Automatically"
                ),
            },
            { label: "Minimum spend", value: Number(p.minSubtotal) > 0 ? `$${p.minSubtotal}` : "None" },
            { label: "Combines", value: p.combinable ? "With other promotions" : "Not with other promotions" },
          ]}
        />
      </Panel>
      <Panel title="Who and when" description="Times are Melbourne time.">
        <DetailRows
          rows={[
            {
              label: "Who",
              value: p.audience === "chosen" ? `${WHO.chosen} (${p.chosenCustomerCount})` : WHO[p.audience],
            },
            {
              label: "Delivery",
              value:
                p.deliveryTypes.length === 2
                  ? "Effy and courier"
                  : p.deliveryTypes[0] === "effy"
                    ? "Delivered by Effy only"
                    : "Courier only",
            },
            { label: "Starts", value: p.startsAt ? formatTime(p.startsAt) : "No lower bound" },
            {
              label: "Ends",
              value: p.endedAt ? `Ended ${formatTime(p.endedAt)}` : p.endsAt ? formatTime(p.endsAt) : "No upper bound",
            },
            { label: "Conditions", value: p.terms ?? none },
          ]}
        />
      </Panel>
      <Panel title="Limits and use">
        <DetailRows
          rows={[
            { label: "Used", value: usesLabel(p) },
            {
              label: "Per customer",
              value: p.maxUsesPerCustomer
                ? `${p.maxUsesPerCustomer} use${p.maxUsesPerCustomer === 1 ? "" : "s"}`
                : "No limit",
            },
            { label: "Discount given", value: `$${p.given}` },
            {
              label: "Budget",
              value: p.budget ? `$${p.budget} · $${(Number(p.budget) - Number(p.given)).toFixed(2)} left` : "No budget",
            },
          ]}
        />
      </Panel>
    </>
  )
}
