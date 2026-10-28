import { useQuery } from "@tanstack/react-query"

import { Badge } from "@effy/design-system/ui"
import { GST_STATUS_WORDS, STORAGE_WORDS, type CategoryFormRow } from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"

import { formQuery } from "./queries"

/** The details step exactly as a shop sees it for this leaf: its sections, order and marks, each row's source. */
export function FormPreview({ categoryId }: { categoryId: string }) {
  const form = useQuery(formQuery(categoryId))
  if (form.isError) return <ErrorState error={form.error} onRetry={() => void form.refetch()} />
  if (form.isPending) return null
  const d = form.data.defaults
  return (
    <section className="space-y-3" aria-label="Shop form preview">
      <div>
        <h3 className="text-base font-semibold">Shop form preview</h3>
        <p className="text-sm text-muted-foreground">
          A new product here starts {d.storage ? STORAGE_WORDS[d.storage].toLowerCase() : "with no storage set"},{" "}
          {d.gstStatus ? GST_STATUS_WORDS[d.gstStatus] : "with no GST status set"}
          {d.ageRestricted ? ", 18+" : ""}.
        </p>
      </div>
      {form.data.sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">No details are asked for here.</p>
      ) : (
        <div className="space-y-5 rounded-md border border-border p-4">
          {form.data.sections.map((s) => (
            <fieldset key={s.title} className="space-y-3">
              <legend className="text-sm font-semibold">{s.title}</legend>
              {s.rows.map((r) => (
                <PreviewRow key={r.attributeId} row={r} />
              ))}
            </fieldset>
          ))}
        </div>
      )}
    </section>
  )
}

function PreviewRow({ row }: { row: CategoryFormRow }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <span className="font-medium">{row.name}</span>
        {row.level === "required" ? <span className="text-xs text-destructive">Required</span> : null}
        {row.level === "recommended" ? (
          <span className="text-xs text-muted-foreground">Helps shoppers find this</span>
        ) : null}
        {row.variesByVariant ? <span className="text-xs text-muted-foreground">Per size</span> : null}
        <Badge variant="outline" className="ml-auto">
          from {row.sourceCategoryName ?? "this category"}
        </Badge>
      </div>
      <Field row={row} />
      {row.helpText ? <p className="text-xs text-muted-foreground">{row.helpText}</p> : null}
    </div>
  )
}

/** A disabled stand-in of the input the shop gets. */
function Field({ row }: { row: CategoryFormRow }) {
  const box = "rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
  switch (row.inputType) {
    case "long_text":
      return <div className={`${box} h-16`}>Text</div>
    case "number":
      return (
        <div className="flex gap-2">
          <div className={`${box} flex-1`}>Number</div>
          {row.unitFamily ? <div className={box}>{row.units.join(" / ")}</div> : null}
        </div>
      )
    case "boolean":
      return <div className={box}>Yes / No</div>
    case "single_select":
    case "multi_select":
      return (
        <div className="flex flex-wrap gap-1.5">
          {row.values.slice(0, 12).map((v) => (
            <Badge key={v.id} variant="secondary">
              {v.label}
            </Badge>
          ))}
          {row.values.length > 12 ? (
            <span className="text-xs text-muted-foreground">+{row.values.length - 12} more</span>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {row.inputType === "multi_select" ? "Choose any" : "Choose one"}
          </span>
        </div>
      )
    case "date":
      return <div className={box}>Date</div>
    case "time":
      return <div className={box}>Time</div>
    default:
      return <div className={box}>Text</div>
  }
}
