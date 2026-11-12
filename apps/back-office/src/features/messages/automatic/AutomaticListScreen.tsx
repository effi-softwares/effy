import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import { Plus, Repeat } from "lucide-react"

import type { AutomationRowDTO, AutomationStatus } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"
import {
  DataTable,
  Facet,
  isFiltered,
  ListPage,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  useListState,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { PageHeader, StatusWord } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { useSessionRoles } from "@/features/auth/useSessionRoles"

import { canManageMessages } from "../access"
import { AUDIENCE_WORD, KIND_WORD, whenWords } from "../words"
import { automaticList } from "./list"
import { AUTOMATIONS_ROOT } from "./queries"
import { fetchAutomationPage } from "./repo"
import { AUTOMATION_STATUS_TONE, AUTOMATION_STATUS_WORD, MODE_WORD } from "./words"

export function AutomationStatusWord({ status }: { status: AutomationStatus }) {
  return <StatusWord tone={AUTOMATION_STATUS_TONE[status]}>{AUTOMATION_STATUS_WORD[status]}</StatusWord>
}

const columns: EffyColumnDef<AutomationRowDTO>[] = [
  {
    id: "name",
    header: "Automatic message",
    cell: ({ row }) => (
      <>
        {row.original.name}
        <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
          {KIND_WORD[row.original.kind]} · {AUDIENCE_WORD[row.original.audience]}
        </span>
      </>
    ),
    meta: { label: "Automatic message", identifying: true, phone: "primary", sortKey: "name" },
  },
  {
    id: "when",
    header: "When",
    cell: ({ row }) => <span className="text-muted-foreground">{row.original.when}</span>,
    meta: { label: "When" },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <AutomationStatusWord status={row.original.status} />,
    meta: { label: "Status", phone: "badge" },
  },
  {
    id: "last",
    header: "Last run",
    cell: ({ row }) => <span className="text-muted-foreground">{whenWords(row.original.lastRunAt)}</span>,
    meta: { label: "Last run", priority: 2, sortKey: "last" },
  },
  {
    id: "next",
    header: "Next run",
    cell: ({ row }) => <span className="text-muted-foreground">{whenWords(row.original.nextRunAt)}</span>,
    meta: { label: "Next run", priority: 2, sortKey: "next" },
  },
]

/** Automatic messages (115): messages that send themselves when something happens, or on a repeat. */
export function AutomaticListScreen() {
  const canManage = canManageMessages(useSessionRoles())
  const state = useListState(automaticList, useSearch({ strict: false }))
  const f = state.view.filters
  const input = { key: AUTOMATIONS_ROOT, list: automaticList, view: state.view, fetch: fetchAutomationPage }
  const query = useQuery(listQueryOptions(input))
  useTourPage("automatic-messages", { status: tourStatus(query) })

  return (
    <ListPage
      header={
        <PageHeader
          back={{ label: "Messages", link: { to: "/messages" } }}
          title="Automatic messages"
          description="Messages that send themselves when something happens, or on a repeat."
          actions={
            canManage ? (
              <Button asChild>
                <Link data-tour="automatic.new" to="/messages/automatic/new">
                  <Plus aria-hidden="true" />
                  New automatic message
                </Link>
              </Button>
            ) : null
          }
        />
      }
    >
      <div data-tour="automatic.list">
        <DataTable
          app="back-office"
          label="Automatic messages"
          list={automaticList}
          state={state}
          columns={columns}
          query={query}
          queryInput={input}
          rowHref={(a) => ({ to: "/messages/automatic/$automationId", params: { automationId: a.id } })}
          empty={{
            icon: Repeat,
            title: "No automatic messages yet.",
            description: canManage
              ? "Set one up to win back customers, remind them about their cart, or repeat a notice."
              : "Automatic messages set up by managers show here.",
          }}
          toolbar={
            <>
              <Facet
                tour="automatic.status"
                label="Status"
                value={f.status ?? null}
                onChange={(v) => state.setFilter("status", v ?? undefined)}
                options={(["active", "paused", "finished"] as const).map((s) => ({ value: s, label: AUTOMATION_STATUS_WORD[s] }))}
              />
              <Facet
                label="When"
                value={f.mode ?? null}
                onChange={(v) => state.setFilter("mode", v ?? undefined)}
                options={(["trigger", "repeat"] as const).map((m) => ({ value: m, label: MODE_WORD[m] }))}
              />
              {isFiltered(state.view) ? <ResetFilters onReset={state.reset} /> : null}
              <SearchBox label="Search automatic messages" placeholder="Name…" value={state.draftQ} onChange={state.setQ} />
            </>
          }
        />
      </div>
    </ListPage>
  )
}
