import { Image as ImageIcon } from "lucide-react"

import type { ProductDraft } from "../draft"
import type { ProductType } from "../model"
import { previewPrice } from "./steps"

interface Props {
  draft: ProductDraft
  type: ProductType | undefined
  imageUrl: string | null
}

export function ShopperPreview({ draft, type, imageUrl }: Props) {
  const sizes = draft.variantSet.variants.length
  return (
    <section className="bo-panel">
      <div className="bo-panel__head">
        <div className="min-w-0 flex-1">
          <h2 className="bo-panel__title">How shoppers see it</h2>
          <p className="bo-panel__desc">Sold under Effy&apos;s name. Shoppers never see which shop supplies it.</p>
        </div>
      </div>
      <div className="bo-panel__body grid gap-3">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="aspect-square w-full rounded-lg border border-border object-cover" />
        ) : (
          <div className="bo-img aspect-square w-full rounded-lg">
            <ImageIcon aria-hidden="true" />
          </div>
        )}
        <div className="grid gap-0.5">
          {draft.brand.trim() ? <div className="text-sm text-muted-foreground">{draft.brand}</div> : null}
          <div className="text-lg font-semibold">{draft.name.trim() || "Untitled product"}</div>
        </div>
        <dl className="bo-dl bo-dl--tight">
          <div className="bo-dl__row">
            <dt>Sold as</dt>
            <dd>{sizes === 1 ? "One size" : `${sizes} sizes`}</dd>
          </div>
          <div className="bo-dl__row">
            <dt>Your price</dt>
            <dd className="tabular-nums">{previewPrice(draft)}</dd>
          </div>
          <div className="bo-dl__row">
            <dt>Type</dt>
            <dd>{type?.name ?? "—"}</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">Customers&apos; price is set by Effy when approved.</p>
      </div>
    </section>
  )
}
