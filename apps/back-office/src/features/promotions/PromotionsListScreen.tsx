import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import { LayoutList, Palette, Plus, SlidersHorizontal, TicketPercent } from "lucide-react"

import {
  PROMOTION_STATES,
  type AdminPromotionListItemDTO,
  type PromotionKind,
  type PromotionState,
} from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"
import {
  DataTable,
  defineListSearch,
  Facet,
  isFiltered,
  ListPage,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  searchFilter,
  useListState,
  ViewSelect,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { MoreActions, PageHeader, StatusWord } from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"
import { promotionGroupsQuery } from "@/features/promotion-groups/queries"

import { canManagePromotions } from "./access"
import { KIND_WORD, STATE_TONE, STATE_WORD, usesLabel } from "./model"
import { PROMO_ROOT } from "./queries"
import { fetchPromotionPage } from "./repo"

type View = "all" | PromotionState

/** Promotions' view in the address (103), mirroring the admin service's `PROMOTION_LIST_SPEC`. */
export const promotionsList = defineListSearch({
  id: "promotions",
  mode: "offset",
  sorts: ["updated", "name", "start", "end", "used"] as const,
  defaultSort: "updated",
  sortDir: { updated: "desc", name: "asc", start: "desc", end: "asc", used: "desc" },
  filters: {
    state: searchFilter.oneOf(PROMOTION_STATES),
    kind: searchFilter.oneOf(["cart", "item", "bxgy", "delivery"] as const),
    trigger: searchFilter.oneOf(["automatic", "code"] as const),
    groupId: searchFilter.uuid,
  },
})

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

const columns: EffyColumnDef<AdminPromotionListItemDTO>[] = [
  {
    id: "promotion",
    header: "Promotion",
    cell: ({ row }) => (
      <>
        {row.original.name}
        <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
          {row.original.codeSummary ? <span className="font-mono">{row.original.codeSummary}</span> : "Automatic"}
        </span>
      </>
    ),
    meta: { label: "Promotion", identifying: true, phone: "primary", sortKey: "name" },
  },
  { id: "gives", header: "Gives", cell: ({ row }) => row.original.gives, meta: { label: "Gives" } },
  { id: "who", header: "Who", cell: ({ row }) => <span className="text-muted-foreground">{row.original.who}</span>, meta: { label: "Who", priority: 2 } },
  { id: "status", header: "Status", cell: ({ row }) => <PromotionStateWord state={row.original.state} />, meta: { label: "Status", phone: "badge" } },
  {
    id: "dates",
    header: "Active dates",
    cell: ({ row }) => <span className="text-muted-foreground">{activeDates(row.original.startsAt, row.original.endsAt)}</span>,
    meta: { label: "Active dates", priority: 2, sortKey: "start" },
  },
  { id: "used", header: "Used", cell: ({ row }) => usesLabel(row.original), meta: { label: "Used", align: "numeric", priority: 2, sortKey: "used", phone: "trail" } },
  {
    id: "shownIn",
    header: "Shown in",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.groups.length ? row.original.groups.join(", ") : "—"}</span>,
    meta: { label: "Shown in", priority: 3 },
  },
]

export function PromotionsListScreen() {
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  const canManage = canManagePromotions(roles)
  const groups = useQuery(promotionGroupsQuery())
  const state = useListState(promotionsList, useSearch({ strict: false }))
  const f = state.view.filters
  const input = { key: PROMO_ROOT, list: promotionsList, view: state.view, fetch: fetchPromotionPage }
  const query = useQuery(listQueryOptions(input))
  const counts = query.data?.counts
  const countOf = (v: View) =>
    counts
      ? v === "all"
        ? Object.entries(counts)
            .filter(([s]) => s !== "archived")
            .reduce((a, [, n]) => a + n, 0)
        : counts[v]
      : undefined

  return (
    <ListPage
      header={
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
      }
    >
      <DataTable
        app="back-office"
        label="Promotions"
        list={promotionsList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        viewFilters={["state"]}
        rowHref={(p) => ({ to: "/promotions/$promoId", params: { promoId: p.id } })}
        empty={{
          icon: TicketPercent,
          title: "No promotions yet.",
          description: "Create a promotion to give shoppers money off — automatically or with a code.",
        }}
        toolbar={
          <>
            <ViewSelect
              label="Promotion views"
              value={(f.state ?? "all") as View}
              onChange={(v) => state.setFilter("state", v === "all" ? undefined : v)}
              options={(["all", ...PROMOTION_STATES] as View[]).map((v) => ({ value: v, label: v === "all" ? "All" : STATE_WORD[v], count: countOf(v) }))}
            />
            <Facet
              label="Kind"
              value={f.kind ?? null}
              onChange={(v) => state.setFilter("kind", v ?? undefined)}
              options={(Object.keys(KIND_WORD) as PromotionKind[]).map((k) => ({ value: k, label: KIND_WORD[k] }))}
            />
            <Facet
              label="Applies"
              value={f.trigger ?? null}
              onChange={(v) => state.setFilter("trigger", v ?? undefined)}
              options={[
                { value: "automatic" as const, label: "Automatically" },
                { value: "code" as const, label: "With a code" },
              ]}
            />
            <Facet
              label="Group"
              anyLabel="Any group"
              value={f.groupId ?? null}
              onChange={(v) => state.setFilter("groupId", v ?? undefined)}
              options={(groups.data ?? []).map((g) => ({ value: g.id, label: g.name }))}
            />
            {isFiltered(state.view, ["state"]) ? <ResetFilters onReset={state.reset} /> : null}
            <SearchBox label="Search promotions" placeholder="Name or code…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
      <p className="text-sm text-muted-foreground">
        Status is worked out from a promotion's dates, uses, budget and whether it is paused — it is never stored.
        Customer service can read every promotion; changing one needs a manager or an administrator.
      </p>
    </ListPage>
  )
}
