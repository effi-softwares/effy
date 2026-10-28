import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useSearch } from "@tanstack/react-router"
import { Users, X } from "lucide-react"

import { Button, Label, Textarea } from "@effy/design-system/ui"

import type { AdminPromotionCustomerDTO } from "@effy/shared-types"
import { DataTable, listQueryOptions, SearchBox, useListState, type EffyColumnDef } from "@effy/web-kit/data-table"
import { Panel } from "@effy/web-kit/patterns"

import { promotionMutationError } from "../errorText"
import { chosenCustomersList } from "../list"
import { PROMO_ROOT, useAddChosenCustomers, useRemoveChosenCustomer } from "../queries"
import { fetchChosenCustomerPage } from "../repo"

export function ChosenCustomers({ promotionId, canManage }: { promotionId: string; canManage: boolean }) {
  const state = useListState(chosenCustomersList, useSearch({ strict: false }))
  const input = {
    key: [...PROMO_ROOT, "customers", promotionId] as const,
    list: chosenCustomersList,
    view: state.view,
    fetch: (qs: URLSearchParams, signal: AbortSignal) => fetchChosenCustomerPage(promotionId, qs, signal),
  }
  const list = useQuery(listQueryOptions(input))
  const add = useAddChosenCustomers(promotionId)
  const remove = useRemoveChosenCustomer(promotionId)
  const [text, setText] = useState("")
  const [note, setNote] = useState<string | null>(null)

  const submit = () => {
    const emails = text
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean)
    setNote(null)
    add.mutate(
      { emails },
      {
        onSuccess: (r) => {
          setText("")
          setNote(`${r.added} added.${r.unknownEmails.length ? ` No account for: ${r.unknownEmails.join(", ")}.` : ""}`)
        },
        onError: (e) => setNote(promotionMutationError(e)),
      },
    )
  }

  const columns: EffyColumnDef<AdminPromotionCustomerDTO>[] = [
    {
      id: "customer",
      header: "Customer",
      cell: ({ row }) => row.original.name ?? row.original.email,
      meta: { label: "Customer", identifying: true, phone: "primary" },
    },
    {
      id: "email",
      header: "Email",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
      meta: { label: "Email", sortKey: "email" },
    },
    ...(canManage
      ? [
          {
            id: "remove",
            header: () => <span className="sr-only">Remove</span>,
            cell: ({ row }) => (
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Remove ${row.original.email}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(row.original.customerId)}
              >
                <X aria-hidden="true" />
              </Button>
            ),
            meta: { label: "Remove", phone: "trail", className: "text-right" },
          } satisfies EffyColumnDef<AdminPromotionCustomerDTO>,
        ]
      : []),
  ]
  return (
    <Panel title="Chosen customers" description="Only these customers see and can use this promotion." flush>
      {canManage ? (
        <div className="space-y-2 border-b border-border px-5 py-4">
          <Label htmlFor="chosen-emails">Add customers by email</Label>
          <Textarea
            id="chosen-emails"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="one@example.com, two@example.com"
          />
          <div className="flex items-center gap-3">
            <Button size="sm" disabled={!text.trim() || add.isPending} onClick={submit}>
              Add
            </Button>
            {note ? (
              <span role="status" className="mt-0.5 block text-sm text-muted-foreground">
                {note}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      <DataTable
        app="back-office"
        label="Chosen customers"
        list={chosenCustomersList}
        state={state}
        columns={columns}
        query={list}
        queryInput={input}
        rowId={(c) => c.customerId}
        empty={{ icon: Users, title: "No customers yet", description: "Nobody can use it until some are added." }}
        toolbar={<SearchBox label="Search chosen customers" placeholder="Name or email…" value={state.draftQ} onChange={state.setQ} />}
      />
    </Panel>
  )
}
