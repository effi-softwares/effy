import { useEffect, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { useHotkey } from "@tanstack/react-hotkeys"
import { MessageSquareText, Star } from "lucide-react"

import { cn } from "@effy/design-system"
import { Badge, Skeleton, Tabs, TabsCount, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { ErrorState } from "@effy/web-kit/console"

import { Kbd, PageHeader, EmptyState, Facet, Pager, SearchBox, Toolbar } from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"
import { dayWord, moment } from "@/lib/format"

import { canReplyFeedback } from "./access"
import { FeedbackPanel } from "./FeedbackPanel"
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackStatus,
} from "./model"
import { feedbackDetailQuery, feedbackListQuery } from "./queries"

const PAGE_SIZE = 25

const VIEWS: readonly (FeedbackStatus | "all")[] = [
  "new",
  "in_review",
  "replied",
  "resolved",
  "archived",
  "spam",
  "all",
]
const COUNTED: readonly FeedbackStatus[] = ["new", "in_review", "replied", "resolved"]

type Received = "today" | "7d" | "30d"
function fromFor(r: Received | null): string | undefined {
  if (!r) return undefined
  const d = new Date()
  if (r === "today") d.setHours(0, 0, 0, 0)
  else d.setDate(d.getDate() - (r === "7d" ? 7 : 30))
  return d.toISOString()
}

export function FeedbackListScreen() {
  const [view, setView] = useState<FeedbackStatus | "all">("new")
  const [q, setQ] = useState("")
  const [category, setCategory] = useState<FeedbackCategory | null>(null)
  const [rating, setRating] = useState<string | null>(null)
  const [received, setReceived] = useState<Received | null>(null)
  const [page, setPage] = useState(0)
  const [open, setOpen] = useState<string | null>(null)

  const params = useMemo(
    () => ({
      q: q.trim() || undefined,
      category: category ?? undefined,
      status: view === "all" ? undefined : view,
      rating: rating ? Number(rating) : undefined,
      from: fromFor(received),
      cursor: page > 0 ? String(page * PAGE_SIZE) : undefined,
      limit: PAGE_SIZE,
    }),
    [q, category, view, rating, received, page],
  )
  const { data, isPending, isError, error, refetch } = useQuery(feedbackListQuery(params))
  const items = data?.items ?? []
  const selected = open ?? items[0]?.referenceCode ?? null
  const index = items.findIndex((i) => i.referenceCode === selected)

  useEffect(() => setOpen(null), [view, q, category, rating, received, page])
  useHotkey("J", () => items[index + 1] && setOpen(items[index + 1]!.referenceCode), { ignoreInputs: true })
  useHotkey("K", () => index > 0 && setOpen(items[index - 1]!.referenceCode), { ignoreInputs: true })

  const reset = () => setPage(0)

  return (
    <>
      <PageHeader
        title="Customer feedback"
        description="Bugs, ideas, complaints and compliments sent by customers, ready to read and answer."
      />

      <div className="space-y-3">
        <Tabs
          value={view}
          onValueChange={(v) => {
            setView(v as FeedbackStatus | "all")
            reset()
          }}
        >
          <TabsList aria-label="Status">
            {VIEWS.map((v) => (
              <TabsTrigger key={v} value={v}>
                {v === "all" ? "All" : FEEDBACK_STATUS_LABELS[v]}
                {v !== "all" && COUNTED.includes(v) ? <StatusCount status={v} /> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Toolbar>
          <SearchBox
            label="Search feedback"
            placeholder="Search message or email…"
            value={q}
            onChange={(v) => {
              setQ(v)
              reset()
            }}
          />
          <Facet
            label="Category"
            value={category}
            onChange={(v) => {
              setCategory(v)
              reset()
            }}
            options={FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: FEEDBACK_CATEGORY_LABELS[c] }))}
          />
          <Facet
            label="Rating"
            value={rating}
            onChange={(v) => {
              setRating(v)
              reset()
            }}
            options={["1", "2", "3", "4", "5"].map((r) => ({ value: r, label: `${r}/5` }))}
          />
          <Facet
            label="Received"
            value={received}
            onChange={(v) => {
              setReceived(v)
              reset()
            }}
            options={[
              { value: "today" as const, label: "Today" },
              { value: "7d" as const, label: "Last 7 days" },
              { value: "30d" as const, label: "Last 30 days" },
            ]}
          />
        </Toolbar>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-120" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={view === "new" ? "Nothing new" : "No feedback matches"}
          description={
            view === "new" ? "Every submission has been looked at." : "Try another status, or clear the filters."
          }
        />
      ) : (
        <div className="grid min-h-160 grid-cols-[380px_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card max-lg:min-h-0 max-lg:grid-cols-[minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col border-r border-r-border max-lg:border-r-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2 text-xs text-muted-foreground">
              <span>{data.total} total</span>
              <span className="flex items-center gap-1 max-lg:hidden">
                <Kbd>J</Kbd>
                <Kbd>K</Kbd> to move
              </span>
            </div>
            {items.map((i) => (
              <InboxItem
                key={i.referenceCode}
                item={i}
                active={i.referenceCode === selected}
                onOpen={() => setOpen(i.referenceCode)}
              />
            ))}
            <div className="mt-auto">
              <Pager
                summary={`Page ${page + 1}`}
                canBack={page > 0}
                canNext={(page + 1) * PAGE_SIZE < data.total}
                onBack={() => setPage((p) => Math.max(0, p - 1))}
                onNext={() => setPage((p) => p + 1)}
              />
            </div>
          </div>
          <div className="flex min-w-0 flex-col max-lg:hidden">
            {selected ? <OpenSubmission referenceCode={selected} /> : null}
          </div>
        </div>
      )}
    </>
  )
}

function StatusCount({ status }: { status: FeedbackStatus }) {
  const { data } = useQuery(feedbackListQuery({ status, limit: 1 }))
  return typeof data?.total === "number" ? <TabsCount>{data.total}</TabsCount> : null
}

function InboxItem({
  item: i,
  active,
  onOpen,
}: {
  item: {
    referenceCode: string
    category: FeedbackCategory
    status: FeedbackStatus
    rating: number | null
    submitter: { name: string | null; email: string | null }
    preview: string
    createdAt: string
  }
  active: boolean
  onOpen: () => void
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-sm", i.status === "new" && "font-semibold")}>
          {i.submitter.name ?? i.submitter.email ?? "Guest"}
        </span>
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {dayWord(i.createdAt) === "Today" ? moment(i.createdAt).replace("Today, ", "") : dayWord(i.createdAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Badge variant="outline">{FEEDBACK_CATEGORY_LABELS[i.category]}</Badge>
        {i.rating ? (
          <Badge variant="outline">
            <Star aria-hidden="true" />
            {i.rating}
          </Badge>
        ) : null}
        <span className="font-mono text-xs text-muted-foreground">{i.referenceCode}</span>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{i.preview}</p>
    </>
  )
  const cls = cn(
    "flex w-full flex-col gap-1 border-b border-b-border px-4 py-3 text-left text-inherit no-underline hover:bg-row-hover",
    active && "bg-row-selected shadow-[inset_2px_0_0_var(--primary)] hover:bg-row-selected",
  )
  return (
    <>
      <button type="button" className={cn(cls, "max-lg:hidden")} aria-current={active || undefined} onClick={onOpen}>
        {body}
      </button>
      <Link to="/feedback/$referenceCode" params={{ referenceCode: i.referenceCode }} className={cn(cls, "lg:hidden")}>
        {body}
      </Link>
    </>
  )
}

function OpenSubmission({ referenceCode }: { referenceCode: string }) {
  const detail = useQuery(feedbackDetailQuery(referenceCode))
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  if (detail.isError)
    return (
      <div className="p-6">
        <ErrorState error={detail.error} onRetry={() => void detail.refetch()} />
      </div>
    )
  if (detail.isPending)
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
      </div>
    )
  return <FeedbackPanel detail={detail.data} mayReply={canReplyFeedback(roles)} showOpenLink />
}
