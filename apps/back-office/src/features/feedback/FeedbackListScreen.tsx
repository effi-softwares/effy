import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { MessageSquareText, Star } from "lucide-react"

import { cn } from "@effy/design-system"
import { Badge } from "@effy/design-system/ui"
import {
  DataTable,
  DateRangeFacet,
  Facet,
  isFiltered,
  ListPage,
  listQueryOptions,
  ResetFilters,
  SearchBox,
  useListState,
  viewsQueryOptions,
  ViewSelect,
  type EffyColumnDef,
} from "@effy/web-kit/data-table"
import { PageHeader } from "@effy/web-kit/patterns"
import { moment } from "@/lib/format"

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_VIEWS,
  feedbackList,
  type FeedbackListDTO,
  type FeedbackView,
} from "./model"
import { ROOT } from "./queries"
import { fetchFeedbackPage, fetchFeedbackViews } from "./repo"

type Item = FeedbackListDTO["items"][number]

const VIEW_LABEL: Record<FeedbackView, string> = {
  open: "Needs a look",
  new: FEEDBACK_STATUS_LABELS.new,
  in_review: FEEDBACK_STATUS_LABELS.in_review,
  replied: FEEDBACK_STATUS_LABELS.replied,
  resolved: FEEDBACK_STATUS_LABELS.resolved,
  archived: FEEDBACK_STATUS_LABELS.archived,
  spam: FEEDBACK_STATUS_LABELS.spam,
  all: "All, spam included",
}

const columns: EffyColumnDef<Item>[] = [
  {
    id: "from",
    header: "From",
    cell: ({ row }) => {
      const i = row.original
      return (
        <>
          <span className={cn(i.status === "new" && "font-semibold")}>{i.submitter.name ?? i.submitter.email ?? "Guest"}</span>
          <span className="mt-0.5 block font-mono text-xs font-normal text-muted-foreground">{i.referenceCode}</span>
        </>
      )
    },
    meta: { label: "From", identifying: true, phone: "primary" },
  },
  {
    id: "received",
    header: "Received",
    cell: ({ row }) => <span className="text-muted-foreground">{moment(row.original.createdAt)}</span>,
    meta: { label: "Received", sortKey: "received", phone: "trail" },
  },
  {
    id: "category",
    header: "Category",
    cell: ({ row }) => <Badge variant="outline">{FEEDBACK_CATEGORY_LABELS[row.original.category]}</Badge>,
    meta: { label: "Category", priority: 2 },
  },
  {
    id: "rating",
    header: "Rating",
    cell: ({ row }) =>
      row.original.rating ? (
        <span className="inline-flex items-center gap-1">
          <Star aria-hidden="true" className="size-3.5" />
          {row.original.rating}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    meta: { label: "Rating", sortKey: "rating", align: "numeric" },
  },
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => FEEDBACK_STATUS_LABELS[row.original.status],
    meta: { label: "Status", phone: "badge" },
  },
  {
    id: "message",
    header: "Message",
    cell: ({ row }) => <span className="line-clamp-2 max-w-[60ch] whitespace-normal text-muted-foreground">{row.original.preview}</span>,
    meta: { label: "Message", priority: 2, phone: "full" },
  },
]

export function FeedbackListScreen() {
  const state = useListState(feedbackList, useSearch({ strict: false }))
  const f = state.view.filters
  const input = { key: ROOT, list: feedbackList, view: state.view, fetch: fetchFeedbackPage }
  const query = useQuery(listQueryOptions(input))
  const views = useQuery(viewsQueryOptions({ key: ROOT, list: feedbackList, view: state.view, except: ["view"], fetch: fetchFeedbackViews }))

  return (
    <ListPage
      header={
        <PageHeader
          title="Customer feedback"
          description="Bugs, ideas, complaints and compliments sent by customers, ready to read and answer."
        />
      }
    >
      <DataTable
        app="back-office"
        label="Customer feedback"
        list={feedbackList}
        state={state}
        columns={columns}
        query={query}
        queryInput={input}
        viewFilters={["view"]}
        rowId={(i) => i.referenceCode}
        rowHref={(i) => ({ to: "/feedback/$referenceCode", params: { referenceCode: i.referenceCode } })}
        empty={{ icon: MessageSquareText, title: "Nothing needs a look", description: "Every submission has been looked at." }}
        toolbar={
          <>
            <ViewSelect
              label="Feedback views"
              value={f.view ?? "open"}
              onChange={(v) => state.setFilter("view", v === "open" ? undefined : v)}
              options={FEEDBACK_VIEWS.map((v) => ({ value: v, label: VIEW_LABEL[v], count: views.data?.views[v], attention: v === "open" }))}
            />
            <Facet
              label="Category"
              value={f.category ?? null}
              onChange={(v) => state.setFilter("category", v ?? undefined)}
              options={FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: FEEDBACK_CATEGORY_LABELS[c] }))}
            />
            <Facet
              label="Rating"
              value={f.rating ?? null}
              onChange={(v) => state.setFilter("rating", v ?? undefined)}
              options={(["1", "2", "3", "4", "5"] as const).map((r) => ({ value: r, label: `${r}/5` }))}
            />
            <DateRangeFacet
              label="Received"
              from={f.receivedFrom}
              to={f.receivedTo}
              onChange={(r) => state.setFilters({ receivedFrom: r.from, receivedTo: r.to })}
            />
            {isFiltered(state.view, ["view"]) ? <ResetFilters onReset={state.reset} /> : null}
            <SearchBox label="Search feedback" placeholder="Message, email or reference…" value={state.draftQ} onChange={state.setQ} />
          </>
        }
      />
    </ListPage>
  )
}
