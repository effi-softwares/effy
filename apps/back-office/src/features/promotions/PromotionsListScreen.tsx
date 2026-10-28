import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { LayoutList, Palette, Plus, SlidersHorizontal, TicketPercent } from "lucide-react"

import { PROMOTION_STATES, type PromotionKind, type PromotionState, type PromotionTrigger } from "@effy/shared-types"
import { Button, Skeleton, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import {
  EmptyState,
  Facet,
  MoreActions,
  PageHeader,
  Pager,
  ResetFilters,
  SearchBox,
  StatusWord,
  Toolbar,
  ViewSelect,
} from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"
import { promotionGroupsQuery } from "@/features/promotion-groups/queries"

import { canManagePromotions } from "./access"
import { KIND_WORD, STATE_TONE, STATE_WORD, usesLabel } from "./model"
import { promotionListQuery } from "./queries"

const PAGE_SIZE = 25
type View = "all" | PromotionState

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Australia/Melbourne",
})

export function activeDates(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt && !endsAt) return "Always"
  if (!endsAt) return `From ${dateFmt.format(new Date(startsAt!))}`
  if (!startsAt) return `Until ${dateFmt.format(new Date(endsAt))}`
  return `${dateFmt.format(new Date(startsAt))} – ${dateFmt.format(new Date(endsAt))}`
}

export function PromotionStateWord({ state }: { state: PromotionState }) {
  return <StatusWord tone={STATE_TONE[state]}>{STATE_WORD[state]}</StatusWord>
}

export function PromotionsListScreen() {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canManage = canManagePromotions(roles)

  const [page, setPage] = useState(1)
  const [view, setView] = useState<View>("all")
  const [search, setSearch] = useState("")
  const [kind, setKind] = useState<PromotionKind | null>(null)
  const [trigger, setTrigger] = useState<PromotionTrigger | null>(null)
  const [groupId, setGroupId] = useState<string | null>(null)
  const groups = useQuery(promotionGroupsQuery())

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      q: search.trim() || undefined,
      state: view === "all" ? undefined : view,
      kind: kind ?? undefined,
      trigger: trigger ?? undefined,
      groupId: groupId ?? undefined,
    }),
    [page, view, search, kind, trigger, groupId],
  )
  const { data, error, isPending, isError, refetch } = useQuery(promotionListQuery(params))
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const filtered = Boolean(search || kind || trigger || groupId)
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v)
      setPage(1)
    }
  const countOf = (v: View) =>
    data
      ? v === "all"
        ? Object.entries(data.counts)
            .filter(([s]) => s !== "archived")
            .reduce((a, [, n]) => a + n, 0)
        : data.counts[v]
      : undefined
  // Archived ones are kept out of "All" (and of the tabs) unless asked for.
  const views: View[] = ["all", ...PROMOTION_STATES]

  return (
    <>
      <PageHeader
        title="Promotions"
        description="All discounts and offers, applied automatically or by code, with their status and schedule."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/promotions/groups">
                <LayoutList aria-hidden="true" />
                Display groups
              </Link>
            </Button>
            {canManage ? (
              <Button asChild>
                <Link to="/promotions/new">
                  <Plus aria-hidden="true" />
                  Create promotion
                </Link>
              </Button>
            ) : null}
            <MoreActions
              actions={[
                { label: "Skins", icon: Palette, link: { to: "/promotions/skins" } },
                { label: "Order rules", icon: SlidersHorizontal, link: { to: "/promotions/order-rules" } },
              ]}
            />
          </>
        }
      />
      <Toolbar>
        <ViewSelect
          label="Promotion views"
          value={view}
          onChange={reset(setView)}
          options={views.map((v) => ({ value: v, label: v === "all" ? "All" : STATE_WORD[v], count: countOf(v) }))}
        />
        <SearchBox label="Search promotions" placeholder="Name or code…" value={search} onChange={reset(setSearch)} />
        <Facet
          label="Kind"
          value={kind}
          onChange={reset(setKind)}
          options={(Object.keys(KIND_WORD) as PromotionKind[]).map((k) => ({ value: k, label: KIND_WORD[k] }))}
        />
        <Facet
          label="Applies"
          value={trigger}
          onChange={reset(setTrigger)}
          options={[
            { value: "automatic", label: "Automatically" },
            { value: "code", label: "With a code" },
          ]}
        />
        <Facet
          label="Group"
          anyLabel="Any group"
          value={groupId}
          onChange={reset(setGroupId)}
          options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
        />
        {filtered ? (
          <ResetFilters
            onReset={() => {
              setSearch("")
              setKind(null)
              setTrigger(null)
              setGroupId(null)
              setPage(1)
            }}
          />
        ) : null}
      </Toolbar>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="overflow-hidden rounded-xl border bg-card p-4" aria-busy="true">
          <Skeleton className="mb-3 h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : data.items.length === 0 ? (
        <EmptyState
          icon={TicketPercent}
          title={filtered || view !== "all" ? "No promotions match your filter." : "No promotions yet."}
          description={
            filtered || view !== "all"
              ? undefined
              : "Create a promotion to give shoppers money off — automatically or with a code."
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="min-w-0">
            <Table className="ef-rtable">
              <TableHeader>
                <TableRow>
                  <TableHead>Promotion</TableHead>
                  <TableHead>Gives</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Active dates</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead>Shown in</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell data-m="primary">
                      <Link to="/promotions/$promoId" params={{ promoId: p.id }} className="link">
                        {p.name}
                      </Link>
                      <div className="mt-0.5 block text-sm text-muted-foreground">
                        {p.codeSummary ? <span className="font-mono">{p.codeSummary}</span> : "Automatic"}
                      </div>
                    </TableCell>
                    <TableCell data-m="meta">{p.gives}</TableCell>
                    <TableCell data-m="meta" className="text-muted-foreground">
                      {p.who}
                    </TableCell>
                    <TableCell data-m="badge">
                      <PromotionStateWord state={p.state} />
                    </TableCell>
                    <TableCell data-m="meta" className="text-muted-foreground">
                      {activeDates(p.startsAt, p.endsAt)}
                    </TableCell>
                    <TableCell data-m="trail" className="text-right tabular-nums">
                      {usesLabel(p)}
                    </TableCell>
                    <TableCell data-m="meta" data-label="Shown in" className="text-muted-foreground">
                      {p.groups.length ? p.groups.join(", ") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager
            summary={`${data.total} promotion${data.total === 1 ? "" : "s"} · page ${data.page} of ${totalPages}`}
            canBack={page > 1}
            canNext={page < totalPages}
            onBack={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}
      <p className="mt-0.5 block text-sm text-muted-foreground">
        Status is worked out from a promotion's dates, uses, budget and whether it is paused — it is never stored.
        Customer service can read every promotion; changing one needs a manager or an administrator.
      </p>
    </>
  )
}
