import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { X } from "lucide-react"

import type { NotificationAudience } from "@effy/shared-types"
import { Button, Input } from "@effy/design-system/ui"

import { searchCustomers } from "@/features/customers/repo"
import { fetchDriverPage } from "@/features/drivers/repo"
import { fetchShopPage } from "@/features/shops/repo"

export interface Person {
  id: string
  name: string
  detail: string
}

/** Customers, drivers or shops found by name or email (at least two letters). */
async function find(audience: NotificationAudience, q: string, signal: AbortSignal): Promise<Person[]> {
  if (audience === "customer") {
    return (await searchCustomers(q)).map((c) => ({ id: c.id, name: c.name || c.email, detail: c.email }))
  }
  const qs = new URLSearchParams({ q })
  if (audience === "driver") {
    return (await fetchDriverPage(qs, signal)).items.map((d) => ({ id: d.id, name: d.name, detail: d.workEmail }))
  }
  return (await fetchShopPage(qs, signal)).items.map((s) => ({ id: s.id, name: s.name, detail: s.code }))
}

export function usePeopleSearch(audience: NotificationAudience, q: string) {
  return useQuery({
    queryKey: ["back-office", "messages", "people", audience, q],
    queryFn: ({ signal }) => find(audience, q, signal),
    enabled: q.trim().length >= 2,
  })
}

const NOUN: Record<NotificationAudience, string> = { customer: "customers", driver: "drivers", shop: "shops" }

/**
 * Chosen people (or shops) by hand (112 R4): search, add, remove. Names are known for people picked here; ones loaded
 * with a saved draft are counted.
 */
export function PeoplePicker({
  audience,
  value,
  onChange,
  max,
  id,
}: {
  audience: NotificationAudience
  value: readonly string[]
  onChange: (ids: string[]) => void
  max?: number
  id: string
}) {
  const [q, setQ] = useState("")
  const [known, setKnown] = useState<Record<string, Person>>({})
  const found = usePeopleSearch(audience, q)
  const full = max !== undefined && value.length >= max
  const unnamed = value.filter((x) => !known[x]).length

  return (
    <div className="space-y-2">
      <Input
        id={id}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={`Search ${NOUN[audience]} by name or email…`}
        disabled={full}
        autoComplete="off"
      />
      {q.trim().length >= 2 ? (
        <ul className="max-h-56 divide-y overflow-auto rounded-md border" aria-label={`Matching ${NOUN[audience]}`}>
          {found.isPending ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Searching…</li>
          ) : (found.data ?? []).length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No {NOUN[audience]} match.</li>
          ) : (
            (found.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{p.name}</span>
                  <span className="block truncate text-muted-foreground">{p.detail}</span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={value.includes(p.id) || full}
                  onClick={() => {
                    setKnown((k) => ({ ...k, [p.id]: p }))
                    onChange([...value, p.id])
                    if (max === 1) setQ("")
                  }}
                >
                  {value.includes(p.id) ? "Added" : "Add"}
                </Button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={`Chosen ${NOUN[audience]}`}>
          {value
            .filter((x) => known[x])
            .map((x) => (
              <li key={x} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                {known[x]!.name}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${known[x]!.name}`}
                  onClick={() => onChange(value.filter((y) => y !== x))}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          {unnamed > 0 ? (
            <li className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
              {unnamed.toLocaleString("en-AU")} chosen earlier
              <button
                type="button"
                className="text-muted-foreground underline hover:text-foreground"
                onClick={() => onChange(value.filter((x) => known[x]))}
              >
                Clear
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
