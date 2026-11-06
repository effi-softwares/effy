import { Plus } from "lucide-react"

import type { LiveValueDTO } from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"

/**
 * Insert a live value into a banner's words (108): the fact is filled from its setting each time the banner is shown,
 * so it never goes stale. Each button says what the value reads now, or that it has nothing to show (a banner naming
 * an empty value is not shown).
 */
export function LiveValueWords({
  values,
  onInsert,
  label,
}: {
  values: readonly LiveValueDTO[]
  onInsert: (token: string) => void
  label: string
}) {
  if (values.length === 0) return null
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={`Insert a live value into the ${label}`}
    >
      {values.map((v) => (
        <Button
          key={v.key}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onInsert(v.token)}
          title={v.why ?? undefined}
        >
          <Plus aria-hidden="true" />
          {v.name}
          <span className="text-muted-foreground">{v.reads ?? "nothing to show"}</span>
        </Button>
      ))}
    </div>
  )
}
