import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"

import { Button, Label, Textarea } from "@effy/design-system/ui"

import { Panel, Pager } from "@effy/web-kit/patterns"

import { promotionMutationError } from "../errorText"
import { chosenCustomersQuery, useAddChosenCustomers, useRemoveChosenCustomer } from "../queries"

export function ChosenCustomers({ promotionId, canManage }: { promotionId: string; canManage: boolean }) {
  const [page, setPage] = useState(1)
  const list = useQuery(chosenCustomersQuery(promotionId, page))
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

  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1
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
              <span role="status" className="bo-sub">
                {note}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
      {list.data && list.data.items.length > 0 ? (
        <>
          <ul className="divide-y divide-border">
            {list.data.items.map((c) => (
              <li key={c.customerId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span>
                  {c.name ?? c.email}
                  {c.name ? <span className="text-muted-foreground"> · {c.email}</span> : null}
                </span>
                {canManage ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${c.email}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(c.customerId)}
                  >
                    <X aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <Pager
            summary={`${list.data.total} customers`}
            canBack={page > 1}
            canNext={page < pages}
            onBack={() => setPage((p) => p - 1)}
            onNext={() => setPage((p) => p + 1)}
          />
        </>
      ) : (
        <p className="px-5 py-4 text-sm text-muted-foreground">
          No customers yet — nobody can use it until some are added.
        </p>
      )}
    </Panel>
  )
}
