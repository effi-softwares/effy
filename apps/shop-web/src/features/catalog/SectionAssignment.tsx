import { useEffect, useMemo, useState } from "react"

import { useQuery } from "@tanstack/react-query"

import { Button, Checkbox, Label } from "@effy/design-system/ui"

import { productMutationError } from "./errorText"
import type { ProductDetail } from "./model"
import { sectionsQuery, useSetProductSections } from "./queries"

export function SectionAssignment({ detail }: { detail: ProductDetail }) {
  const sections = useQuery(sectionsQuery)
  const setSections = useSetProductSections(detail.id)
  const [error, setError] = useState<string | null>(null)

  const initial = useMemo(() => new Set(detail.sections), [detail.sections])
  const [checked, setChecked] = useState<Set<string>>(initial)

  useEffect(() => {
    setChecked(new Set(detail.sections))
    setError(null)
  }, [detail.updatedAt, detail.sections])

  const dirty = checked.size !== initial.size || [...checked].some((id) => !initial.has(id))

  function toggle(id: string, on: boolean) {
    setChecked((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function save() {
    setError(null)
    setSections.mutate({ sectionIds: [...checked] }, { onError: (err) => setError(productMutationError(err)) })
  }

  const all = sections.data ?? []

  return (
    <div className="space-y-3">
      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This shop has no sections yet. Create one from “Manage sections” on the catalog.
        </p>
      ) : (
        <div className="space-y-2">
          {[...all]
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((s) => (
              <div key={s.id} className="flex items-center gap-2">
                <Checkbox
                  id={`sec-${s.id}`}
                  checked={checked.has(s.id)}
                  onCheckedChange={(v) => toggle(s.id, v === true)}
                />
                <Label htmlFor={`sec-${s.id}`}>{s.name}</Label>
              </div>
            ))}
        </div>
      )}

      {all.length > 0 ? (
        <Button size="sm" onClick={save} disabled={!dirty || setSections.isPending}>
          {setSections.isPending ? "Saving…" : "Save sections"}
        </Button>
      ) : null}

      {error ? <p className="text-sm font-medium">{error}</p> : null}
    </div>
  )
}
