import type { ReviewVariantDTO } from "@effy/shared-types"

import { Panel, StatusWord, type StatusTone } from "@effy/web-kit/patterns"

import { previewCustomerPrice, type MarginEntry } from "./model"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"

const CHANGE_WORD: Record<ReviewVariantDTO["change"], { word: string; tone: StatusTone } | null> = {
  added: { word: "New", tone: "info" },
  changed: { word: "Changed", tone: "waiting" },
  removed: { word: "Removed", tone: "muted" },
  unchanged: null,
}

export function ReviewVariants({ variants, entry }: { variants: readonly ReviewVariantDTO[]; entry: MarginEntry }) {
  const named = variants.some((v) => v.label !== null)
  // Attributes marked "may differ by size" (101): each size's own values, sizes being removed left out.
  const perSize = variants.filter((v) => v.change !== "removed" && v.details.length > 0)
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
      <div className="min-w-0">
        <Table>
          <TableHeader>
            <TableRow>
              {named ? <TableHead>Size</TableHead> : null}
              <TableHead>Effy code</TableHead>
              <TableHead>Shop code</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead className="text-right">Shop price</TableHead>
              <TableHead className="text-right">Customers pay</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead>Pack</TableHead>
              <TableHead>
                <span className="sr-only">Change</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => {
              const preview =
                v.change === "removed" ? null : previewCustomerPrice(v.shopPriceAmount, entry.kind, entry.value)
              const change = CHANGE_WORD[v.change]
              return (
                <TableRow key={v.id} className={v.change === "removed" ? "text-muted-foreground" : undefined}>
                  {named ? (
                    <TableHead scope="row" className="text-left font-medium">
                      {v.label ?? "—"}
                    </TableHead>
                  ) : null}
                  <TableCell className="font-mono text-xs">{v.code ?? "On approval"}</TableCell>
                  <TableCell className="font-mono text-xs">{v.sku ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{v.gtin ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {v.shopPriceAmount}
                    {v.shopCompareAtAmount ? (
                      <span className="block text-xs text-muted-foreground line-through">{v.shopCompareAtAmount}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {preview ?? v.customerPriceAmount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{v.weightGrams} g</TableCell>
                  <TableCell>{v.packQuantity ? `${Number(v.packQuantity)} ${v.packUnit ?? ""}` : "—"}</TableCell>
                  <TableCell>
                    {change ? (
                      <StatusWord tone={change.tone}>{change.word}</StatusWord>
                    ) : v.state === "inactive" ? (
                      <StatusWord tone="muted">Off sale</StatusWord>
                    ) : null}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {perSize.length > 0 ? (
        <div className="space-y-3 border-t border-border px-5 py-4">
          <h3 className="text-base font-semibold">Details that differ by size</h3>
          {perSize.map((v) => (
            <div key={v.id} className="space-y-1">
              <p className="text-sm font-medium">{v.label ?? "This size"}</p>
              <dl className="ef-dl ef-dl--tight">
                {v.details.map((d) => (
                  <div key={d.label} className="ef-dl__row">
                    <dt>{d.label}</dt>
                    <dd className="whitespace-pre-line wrap-break-word">{d.value ?? "—"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  )
}
