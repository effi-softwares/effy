import { Image as ImageIcon } from "lucide-react";

import type { ProductDraft } from "./draft";
import { pathText } from "./model";
import { previewPrice } from "./steps";

interface Props {
  draft: ProductDraft;
  /** The chosen leaf's path, department first. */
  path: string[] | null;
  imageUrl: string | null;
}

export function ShopperPreview({ draft, path, imageUrl }: Props) {
  const sizes = draft.variantSet.variants.length;
  return (
    <section className="ef-panel">
      <div className="ef-panel__head">
        <div className="min-w-0 flex-1">
          <h2 className="ef-panel__title">How shoppers see it</h2>
          <p className="ef-panel__desc">
            Sold under Effy&apos;s name. Shoppers never see which shop supplies
            it.
          </p>
        </div>
      </div>
      <div className="ef-panel__body grid gap-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="aspect-square w-full rounded-lg border border-border object-cover"
          />
        ) : (
          <div className="ef-img aspect-square w-full rounded-lg">
            <ImageIcon aria-hidden="true" />
          </div>
        )}
        <div className="grid gap-1">
          {draft.brand.trim() ? (
            <div className="text-sm text-muted-foreground">{draft.brand}</div>
          ) : null}
          <div className="text-lg font-semibold">
            {draft.name.trim() || "Untitled product"}
          </div>
        </div>
        <dl className="ef-dl ef-dl--tight">
          <div className="ef-dl__row">
            <dt>Sold as</dt>
            <dd>{sizes === 1 ? "One size" : `${sizes} sizes`}</dd>
          </div>
          <div className="ef-dl__row">
            <dt>Your price</dt>
            <dd className="tabular-nums">{previewPrice(draft)}</dd>
          </div>
          <div className="ef-dl__row">
            <dt>Found under</dt>
            <dd>{path ? pathText(path) : "—"}</dd>
          </div>
          {draft.facts.ageRestricted ? (
            <div className="ef-dl__row">
              <dt>Age</dt>
              <dd>18+ only</dd>
            </div>
          ) : null}
        </dl>
        <p className="text-sm text-muted-foreground">
          Customers&apos; price is set by Effy when approved.
        </p>
      </div>
    </section>
  );
}
