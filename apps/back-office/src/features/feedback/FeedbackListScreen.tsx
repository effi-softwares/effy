import { useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import type { ColumnDef } from "@tanstack/react-table"

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui"
import { DataTable, ErrorState } from "@effy/web-kit/console"

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_SETTABLE_STATUSES,
  FEEDBACK_STATUS_LABELS,
  type FeedbackCategory,
  type FeedbackListItemDTO,
  type FeedbackStatus,
} from "./model"
import { feedbackListQuery } from "./queries"

/**
 * Customer feedback (046 US2).
 *
 * ⚠ NO CARDS, NO METRIC TILES (Principle V). A table + detail rows. A "12 new this week" tile would
 * answer a question nobody asks; the list of WHAT people said is the whole product.
 */
const PAGE_SIZE = 25
const ANY = "any"

const columns: ColumnDef<FeedbackListItemDTO>[] = [
  {
    accessorKey: "referenceCode",
    header: "Reference",
    cell: ({ row }) => (
      <Link
        to="/feedback/$referenceCode"
        params={{ referenceCode: row.original.referenceCode }}
        className="font-mono text-sm text-primary hover:underline"
      >
        {row.original.referenceCode}
      </Link>
    ),
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => <span className="text-sm">{FEEDBACK_CATEGORY_LABELS[row.original.category]}</span>,
  },
  {
    accessorKey: "status",
    // ⚠ A TEXT LABEL, never colour alone (Principle V).
    header: "Status",
    cell: ({ row }) => <span className="text-sm">{FEEDBACK_STATUS_LABELS[row.original.status]}</span>,
  },
  {
    accessorKey: "rating",
    header: "Rating",
    cell: ({ row }) =>
      row.original.rating ? (
        <span className="text-sm">{row.original.rating}/5</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: "submitter",
    header: "From",
    cell: ({ row }) => {
      const s = row.original.submitter
      return (
        <span className="text-sm">
          {s.name ?? s.email ?? <span className="text-muted-foreground">Guest</span>}{" "}
          <span className="text-xs text-muted-foreground">({s.kind})</span>
        </span>
      )
    },
  },
  {
    accessorKey: "preview",
    header: "Message",
    cell: ({ row }) => (
      <span className="line-clamp-2 max-w-md text-sm text-muted-foreground">{row.original.preview}</span>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Received",
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </span>
    ),
  },
]

export function FeedbackListScreen() {
  const [q, setQ] = useState("")
  const [category, setCategory] = useState<string>(ANY)
  const [status, setStatus] = useState<string>(ANY)
  const [rating, setRating] = useState<string>(ANY)
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(0)

  const params = useMemo(
    () => ({
      q: q.trim() || undefined,
      category: category === ANY ? undefined : (category as FeedbackCategory),
      status: status === ANY ? undefined : (status as FeedbackStatus),
      rating: rating === ANY ? undefined : Number(rating),
      from: from || undefined,
      to: to || undefined,
      cursor: page > 0 ? String(page * PAGE_SIZE) : undefined,
      limit: PAGE_SIZE,
    }),
    [q, category, status, rating, from, to, page],
  )

  const { data, isPending, isError, error, refetch } = useQuery(feedbackListQuery(params))

  const reset = () => setPage(0)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Customer feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What shoppers have told us — bugs, ideas, complaints and compliments. Open one to read it in
          full, add an internal note, change its status, or reply.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Input
          placeholder="Search message or email…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            reset()
          }}
          className="max-w-xs"
        />

        <FilterSelect
          value={category}
          onChange={(v) => {
            setCategory(v)
            reset()
          }}
          anyLabel="Any category"
          options={FEEDBACK_CATEGORIES.map((c) => ({ value: c, label: FEEDBACK_CATEGORY_LABELS[c] }))}
        />
        <FilterSelect
          value={status}
          onChange={(v) => {
            setStatus(v)
            reset()
          }}
          anyLabel="Any status"
          options={[...FEEDBACK_SETTABLE_STATUSES, "replied" as FeedbackStatus].map((s) => ({
            value: s,
            label: FEEDBACK_STATUS_LABELS[s],
          }))}
        />
        <FilterSelect
          value={rating}
          onChange={(v) => {
            setRating(v)
            reset()
          }}
          anyLabel="Any rating"
          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n}/5` }))}
        />

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              reset()
            }}
            className="w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              reset()
            }}
            className="w-40"
          />
        </label>
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={data.items}
            emptyMessage="No feedback matches these filters yet."
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{data.total} total</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  anyLabel,
  options,
}: {
  value: string
  onChange: (v: string) => void
  anyLabel: string
  options: { value: string; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="any">{anyLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
