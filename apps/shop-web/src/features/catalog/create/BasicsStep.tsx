import type { ReactNode } from "react"

import { GST_STATUS_WORDS, type GstStatus } from "@effy/shared-types"
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@effy/design-system/ui"

import type { ProductDraft } from "../draft"
import type { Category } from "../model"

interface Props {
  draft: ProductDraft
  categories: { category: Category; depth: number }[]
  onField: (patch: Partial<ProductDraft>) => void
}

export function BasicsStep({ draft, categories, onField }: Props) {
  return (
    <div className="space-y-4">
      <Field id="p-name" label="Name" required>
        <Input id="p-name" value={draft.name} onChange={(e) => onField({ name: e.target.value })} />
      </Field>

      <Field id="p-category" label="Category" required>
        <Select value={draft.primaryCategoryId ?? ""} onValueChange={(v) => onField({ primaryCategoryId: v })}>
          <SelectTrigger id="p-category">
            <SelectValue placeholder="Choose a category…" />
          </SelectTrigger>
          <SelectContent>
            {categories.map(({ category, depth }) => (
              <SelectItem key={category.id} value={category.id}>
                {`${" ".repeat(depth * 2)}${category.name}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field id="p-brand" label="Brand (optional)">
        <Input id="p-brand" value={draft.brand} onChange={(e) => onField({ brand: e.target.value })} />
      </Field>

      <Field id="p-gst" label="GST" required>
        <Select value={draft.gstStatus} onValueChange={(v) => onField({ gstStatus: v as GstStatus })}>
          <SelectTrigger id="p-gst" aria-describedby="p-gst-help">
            <SelectValue placeholder="Choose…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gst_free">{GST_STATUS_WORDS.gst_free}</SelectItem>
            <SelectItem value="taxable">{GST_STATUS_WORDS.taxable}</SelectItem>
          </SelectContent>
        </Select>
        <p id="p-gst-help" className="text-sm text-muted-foreground">
          Most basic food is GST-free; prepared food, drinks other than milk and water, and household goods are usually
          taxable. If you're not sure, ask your accountant — Effy reviews it.
        </p>
      </Field>

      <Field id="p-short" label="Short description" required>
        <Textarea
          id="p-short"
          value={draft.shortDescription}
          onChange={(e) => onField({ shortDescription: e.target.value })}
        />
      </Field>
    </div>
  )
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string
  label: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-muted-foreground">*</span> : null}
      </Label>
      {children}
    </div>
  )
}
