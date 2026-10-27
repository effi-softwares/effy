import {
  formatAttributeValue,
  formRows,
  GST_STATUS_WORDS,
  STORAGE_WORDS,
  type CategoryFormDTO,
} from "@effy/shared-types"
import { Progress } from "@effy/design-system/ui"

import type { ProductDraft } from "../draft"
import { pathText } from "../model"
import { previewPrice } from "./steps"

interface Props {
  draft: ProductDraft
  form: CategoryFormDTO | undefined
  imageUrl: string | null
  uploadProgress: number | null
  /** Required details still empty: submitting is refused while any are. */
  missing: string[]
}

export function ReviewStep({ draft, form, imageUrl, uploadProgress, missing }: Props) {
  const rows = form ? formRows(form) : []
  const entered = draft.details
    .map((d) => ({ d, row: rows.find((r) => r.attributeId === d.attributeId) }))
    .filter((x) => x.row && (x.d.value !== undefined || (x.d.perVariant?.length ?? 0) > 0))

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        {imageUrl ? (
          <img src={imageUrl} alt="Primary product" className="size-20 shrink-0 rounded-md border object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="truncate font-medium">{draft.name || "Untitled product"}</p>
          <p className="text-sm text-muted-foreground">{form ? pathText(form.path) : "—"}</p>
        </div>
      </div>

      {uploadProgress != null ? (
        <div className="space-y-1">
          <Progress value={uploadProgress} tone="brand" height={6} label="Image upload" />
          <p className="text-xs text-muted-foreground">Uploading image… {uploadProgress}%</p>
        </div>
      ) : null}

      {missing.length > 0 ? (
        <p role="alert" className="text-sm font-medium">
          Fill in before submitting: {missing.join(", ")}.
        </p>
      ) : null}

      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{draft.name || "—"}</dd>
        <dt className="text-muted-foreground">Category</dt>
        <dd>{form ? pathText(form.path) : "—"}</dd>
        <dt className="text-muted-foreground">Price</dt>
        <dd>{previewPrice(draft)}</dd>
        <dt className="text-muted-foreground">Variants</dt>
        <dd>{draft.variantSet.variants.length}</dd>
        {draft.brand ? (
          <>
            <dt className="text-muted-foreground">Brand</dt>
            <dd>{draft.brand}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Storage</dt>
        <dd>{draft.facts.storage ? STORAGE_WORDS[draft.facts.storage] : "—"}</dd>
        <dt className="text-muted-foreground">GST</dt>
        <dd>{draft.facts.gstStatus ? GST_STATUS_WORDS[draft.facts.gstStatus] : "—"}</dd>
        <dt className="text-muted-foreground">18+</dt>
        <dd>{draft.facts.ageRestricted === null ? "—" : draft.facts.ageRestricted ? "Yes" : "No"}</dd>
        <dt className="text-muted-foreground">Description</dt>
        <dd>{draft.shortDescription || "—"}</dd>
        {entered.map(({ d, row }) => (
          <div key={d.attributeId} className="contents">
            <dt className="text-muted-foreground">{row!.name}</dt>
            <dd>{d.value ? formatAttributeValue(row!, d.value) : "Differs by size"}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
