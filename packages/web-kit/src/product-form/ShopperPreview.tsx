import { Image as ImageIcon } from "lucide-react";

import { Card } from "@effy/design-system/ui";
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
    <section className="min-w-0">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-4 max-md:px-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 leading-6 font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
              How shoppers see it
            </h2>
            <p className="text-sm text-muted-foreground">
              Sold under Effy&apos;s name. Shoppers never see which shop
              supplies it.
            </p>
          </div>
        </div>
        <div className="px-5 py-4 max-md:px-4 grid gap-3">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="aspect-square w-full rounded-lg border object-cover"
            />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-lg bg-muted text-muted-foreground">
              <ImageIcon aria-hidden="true" className="size-8" />
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
      </Card>
    </section>
  );
}
