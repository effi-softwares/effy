import { useQuery } from "@tanstack/react-query"
import { Link, useSearch } from "@tanstack/react-router"
import { Plus, Send } from "lucide-react"

import {
  MESSAGE_KIND_VALUES,
  MESSAGE_STATUSES,
  type MessageKind,
  type MessageRowDTO,
  type MessageStatus,
} from "@effy/shared-types"
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

import { canManageMessages } from "./access"
import { messagesList } from "./list"
import { MESSAGES_ROOT } from "./queries"
import { fetchMessagePage } from "./repo"
import { AUDIENCE_WORD, audienceList, KIND_WORD, percent, STATUS_TONE, STATUS_WORD, whenWords } from "./words"

export function MessageStatusWord({ status }: { status: MessageStatus }) {
  return <StatusWord tone={STATUS_TONE[status]}>{STATUS_WORD[status]}</StatusWord>
}

const columns: EffyColumnDef<MessageRowDTO>[] = [
  {
    id: "title",
    header: "Message",
    cell: ({ row }) => (
      <>
        {row.original.title}
        <span className="mt-0.5 block text-sm font-normal text-muted-foreground">{KIND_WORD[row.original.kind]}</span>
      </>
    ),
    meta: { label: "Message", identifying: true, phone: "primary", sortKey: "title" },
  },
  {
    id: "audiences",
    header: "To",
    cell: ({ row }) => <span className="text-muted-foreground">{audienceList(row.original.audiences)}</span>,
    meta: { label: "To" },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => <MessageStatusWord status={row.original.status} />,
    meta: { label: "Status", phone: "badge" },
  },
  {
    id: "sent",
    header: "Sent",
    cell: ({ row }) => (
      <span className="text-muted-foreground">{whenWords(row.original.sentAt ?? row.original.sendAt)}</span>
    ),
    meta: { label: "Sent", priority: 2, sortKey: "sent" },
  },
  {
    id: "reached",
    header: "Reached",
    cell: ({ row }) => row.original.reached.toLocaleString("en-AU"),
    meta: { label: "Reached", align: "numeric", priority: 2, phone: "trail" },
  },
  {
    id: "opened",
    header: "Opened",
    cell: ({ row }) => <span className="text-muted-foreground">{percent(row.original.openedShare)}</span>,
    meta: { label: "Opened", align: "numeric", priority: 3 },
  },
]

/** Messages (112): everything Effy sends from back-office to customers, drivers and shops, and what happened to each. */
export function MessagesListScreen() {
  const canManage = canManageMessages(useSessionRoles())
  const state = useListState(messagesList, useSearch({ strict: false }))
  const f = state.view.filters
  const input = { key: MESSAGES_ROOT, list: messagesList, view: state.view, fetch: fetchMessagePage }
  const query = useQuery(listQueryOptions(input))
  useTourPage("messages", { status: tourStatus(query) })

  return (
    <ListPage
      header={
        <PageHeader
          title="Messages"
          description="Announcements, important notices, offers and news sent from here, and what happened to each."
          actions={
            canManage ? (
              <Button asChild>
                <Link data-tour="messages.new" to="/messages/new">
                  <Plus aria-hidden="true" />
                  New message
                </Link>
              </Button>
            ) : null
          }
        />
      }
    >
      <div data-tour="messages.list">
        <DataTable
          app="back-office"
          label="Messages"
          list={messagesList}
          state={state}
          columns={columns}
          query={query}
          queryInput={input}
          rowHref={(m) => ({ to: "/messages/$messageId", params: { messageId: m.id } })}
          empty={{
            icon: Send,
            title: "No messages yet.",
            description: canManage
              ? "Write one to tell drivers, shops or customers something."
              : "Messages written by managers show here. Message one person from their page.",
          }}
          toolbar={
            <>
              <Facet
                tour="messages.status"
                label="Status"
                value={f.status ?? null}
                onChange={(v) => state.setFilter("status", v ?? undefined)}
                options={(MESSAGE_STATUSES as MessageStatus[]).map((s) => ({ value: s, label: STATUS_WORD[s] }))}
              />
              <Facet
                label="Kind"
                value={f.kind ?? null}
                onChange={(v) => state.setFilter("kind", v ?? undefined)}
                options={(MESSAGE_KIND_VALUES as MessageKind[]).map((k) => ({ value: k, label: KIND_WORD[k] }))}
              />
              <Facet
                label="To"
                value={f.audience ?? null}
                onChange={(v) => state.setFilter("audience", v ?? undefined)}
                options={(["customer", "driver", "shop"] as const).map((a) => ({ value: a, label: AUDIENCE_WORD[a] }))}
              />
              {isFiltered(state.view) ? <ResetFilters onReset={state.reset} /> : null}
              <SearchBox label="Search messages" placeholder="Title…" value={state.draftQ} onChange={state.setQ} />
            </>
          }
        />
      </div>
    </ListPage>
  )
}
