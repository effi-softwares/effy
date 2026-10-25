import { GST_STATUS_WORDS } from "@effy/shared-types"
import { Progress } from "@effy/design-system/ui"

import type { ProductDraft } from "../draft"
import type { Category, ProductType } from "../model"
import { previewPrice } from "./steps"

interface Props {
  draft: ProductDraft
  type: ProductType | undefined
  categories: { category: Category; depth: number }[]
  imageUrl: string | null
  uploadProgress: number | null
}

export function ReviewStep({ draft, type, categories, imageUrl, uploadProgress }: Props) {
  const categoryName = categories.find((c) => c.category.id === draft.primaryCategoryId)?.category.name ?? "—"

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        {imageUrl ? (
          <img src={imageUrl} alt="Primary product" className="size-20 shrink-0 rounded-md border object-cover" />
        ) : null}
        <div className="min-w-0">
          <p className="truncate font-medium">{draft.name || "Untitled product"}</p>
          <p className="text-sm text-muted-foreground">{type?.name ?? "—"}</p>
        </div>
      </div>

      {uploadProgress != null ? (
        <div className="space-y-1">
          <Progress value={uploadProgress} tone="brand" height={6} label="Image upload" />
          <p className="text-xs text-muted-foreground">Uploading image… {uploadProgress}%</p>
        </div>
      ) : null}

      <dl className="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Type</dt>
        <dd>{type?.name ?? "—"}</dd>
        <dt className="text-muted-foreground">Name</dt>
        <dd>{draft.name || "—"}</dd>
        <dt className="text-muted-foreground">Category</dt>
        <dd>{categoryName}</dd>
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
        <dt className="text-muted-foreground">GST</dt>
        <dd>{draft.gstStatus ? GST_STATUS_WORDS[draft.gstStatus] : "—"}</dd>
        <dt className="text-muted-foreground">Description</dt>
        <dd>{draft.shortDescription || "—"}</dd>
      </dl>
    </div>
  )
}
