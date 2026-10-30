import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { MailCheck } from "lucide-react"

import {
  DataTable,
  ListPage,
  listQueryOptions,
  SearchBox,
  useListState,
  viewsQueryOptions,
  ViewSelect,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { PageHeader, StatusWord } from "@effy/web-kit/patterns"
import { moment } from "@/lib/format"

import { DELIVERABILITY_VIEWS, deliverabilityList, STATE_LABEL, type DeliverabilityView, type DeliveryListItem, type EmailDeliveryState } from "./model"
import { ROOT } from "./queries"
import { fetchDeliverabilityPage, fetchDeliverabilityViews } from "./repo"

const VIEW_LABEL: Record<DeliverabilityView, string> = {
  problems: "Needs attention",
  undeliverable: STATE_LABEL.undeliverable,
  soft_failing: STATE_LABEL.soft_failing,
  complained: STATE_LABEL.complained,
  reachable: STATE_LABEL.reachable,
  all: "All addresses",
}

const columns: EffyColumnDef<DeliveryListItem>[] = [
  { id: "address", header: "Address", cell: ({ row }) => row.original.address, meta: { label: "Address", identifying: true, phone: "primary", sortKey: "address" } },
  { id: "state", header: "State", cell: ({ row }) => <StateLabel state={row.original.state} />, meta: { label: "State", phone: "badge" } },
  {
    id: "account",
    header: "Account",
    cell: ({ row }) =>
      row.original.subject ? (
        <>
          {row.original.subject.name ?? <span className="text-muted-foreground">unnamed</span>}{" "}
          <span className="text-sm text-muted-foreground">({row.original.subject.kind.replace("_", " ")})</span>
        </>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
    meta: { label: "Account", priority: 2 },
  },
  {
    id: "reason",
    header: "Reason",
    cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.reason ?? "-"}</span>,
    meta: { label: "Reason", priority: 2 },
  },
  {
    id: "lastEvent",
    header: "Last event",
    cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.lastEventAt)}</span>,
    meta: { label: "Last event", sortKey: "lastEvent", phone: "trail" },
  },
]

export function DeliverabilityListScreen() {
  const state = useListState(deliverabilityList, useSearch({ strict: false }))
  const input = { key: ROOT, list: deliverabilityList, view: state.view, fetch: fetchDeliverabilityPage }
  const query = useQuery(listQueryOptions(input))
  const views = useQuery(viewsQueryOptions({ key: ROOT, list: deliverabilityList, view: state.view, except: ["view"], fetch: fetchDeliverabilityViews }))

  return (
    <ListPage
      header={
        <PageHeader
          title="Email deliverability"
          description="Email addresses that are bouncing or rejected, which can stop people receiving sign-in codes."
        />
      }
    >
      <DataTable
        app="back-office"
        label="Email deliverability"
        list={deliverabilityList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        viewFilters={["view"]}
        rowId={(r) => r.address}
        rowHref={(r) => ({ to: "/deliverability/$address", params: { address: r.address } })}
        empty={{ icon: MailCheck, title: "No delivery problems.", description: "Every address the platform has emailed is reachable." }}
        toolbar={
          <>
            <ViewSelect
              label="Deliverability views"
              value={state.view.filters.view ?? "problems"}
              onChange={(v) => state.setFilter("view", v === "problems" ? undefined : v)}
              options={DELIVERABILITY_VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v], count: views.data?.views[v], attention: v === "problems" }))}
            />
            <SearchBox label="Search address" placeholder="Search address…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
    </ListPage>
  )
}

const STATE_TONE = {
  undeliverable: "problem",
  soft_failing: "waiting",
  complained: "waiting",
  reachable: "quiet",
} as const

export function StateLabel({ state }: { state: EmailDeliveryState }) {
  return <StatusWord tone={STATE_TONE[state as keyof typeof STATE_TONE] ?? "quiet"}>{STATE_LABEL[state]}</StatusWord>
}
