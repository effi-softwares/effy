import type { ReviewVariantDTO } from "@effy/shared-types"

import { Panel, StatusWord, type StatusTone } from "@effy/web-kit/patterns"

import { previewCustomerPrice, type MarginEntry } from "./model"

const CHANGE_WORD: Record<ReviewVariantDTO["change"], { word: string; tone: StatusTone } | null> = {
  added: { word: "New", tone: "info" },
  changed: { word: "Changed", tone: "waiting" },
  removed: { word: "Removed", tone: "muted" },
  unchanged: null,
}

export function ReviewVariants({ variants, entry }: { variants: readonly ReviewVariantDTO[]; entry: MarginEntry }) {
  const named = variants.some((v) => v.label !== null)
  return (
    <Panel
      title="Sizes and prices"
      description={
        variants.length === 1
          ? "Sold as one item."
          : `${variants.filter((v) => v.change !== "removed").length} sizes on sale after this decision.`
      }
      flush
    >
      <div className="ef-table-scroll">
        <table className="ef-table">
          <thead>
            <tr>
              {named ? <th>Size</th> : null}
              <th>Effy code</th>
              <th>Shop code</th>
              <th>Barcode</th>
              <th className="text-right">Shop price</th>
              <th className="text-right">Customers pay</th>
              <th className="text-right">Weight</th>
              <th>Pack</th>
              <th>
                <span className="sr-only">Change</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const preview =
                v.change === "removed" ? null : previewCustomerPrice(v.shopPriceAmount, entry.kind, entry.value)
              const change = CHANGE_WORD[v.change]
              return (
                <tr key={v.id} className={v.change === "removed" ? "text-muted-foreground" : undefined}>
                  {named ? (
                    <th scope="row" className="text-left font-medium">
                      {v.label ?? "—"}
                    </th>
                  ) : null}
                  <td className="font-mono text-xs">{v.code ?? "On approval"}</td>
                  <td className="font-mono text-xs">{v.sku ?? "—"}</td>
                  <td className="font-mono text-xs">{v.gtin ?? "—"}</td>
                  <td className="text-right tabular-nums">
                    {v.shopPriceAmount}
                    {v.shopCompareAtAmount ? (
                      <span className="block text-xs text-muted-foreground line-through">{v.shopCompareAtAmount}</span>
                    ) : null}
                  </td>
                  <td className="text-right tabular-nums font-medium">{preview ?? v.customerPriceAmount}</td>
                  <td className="text-right tabular-nums">{v.weightGrams} g</td>
                  <td>{v.packQuantity ? `${Number(v.packQuantity)} ${v.packUnit ?? ""}` : "—"}</td>
                  <td>
                    {change ? (
                      <StatusWord tone={change.tone}>{change.word}</StatusWord>
                    ) : v.state === "inactive" ? (
                      <StatusWord tone="muted">Off sale</StatusWord>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
