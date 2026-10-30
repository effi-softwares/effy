import type { ReviewVariantDTO } from "@effy/shared-types"

import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { StatusWord, type StatusTone } from "@effy/web-kit/patterns"

import { cn } from "@/lib/utils"

import { previewCustomerPrice, priceMove, PRICE_RISE_TO_LOOK_AT, signedPercent, type MarginEntry } from "./model"

const CHANGE_WORD: Record<ReviewVariantDTO["change"], { word: string; tone: StatusTone } | null> = {
  added: { word: "New", tone: "info" },
  changed: { word: "Changed", tone: "waiting" },
  removed: { word: "Removed", tone: "muted" },
  unchanged: null,
}

/** The sizes under review, each as it will be after the decision (103: a bounded table, no pager). */
function variantColumns(
  named: boolean,
  entry: MarginEntry,
  /** A size's shop price before the change, by size id. */
  was: ReadonlyMap<string, string | null>,
): EffyColumnDef<ReviewVariantDTO>[] {
  return [
    ...(named
      ? [
        {
          id: "size",
          header: "Size",
          cell: ({ row }) => <span className="font-medium">{row.original.label ?? "-"}</span>,
          meta: { label: "Size", identifying: true, phone: "primary" },
        } satisfies EffyColumnDef<ReviewVariantDTO>,
      ]
      : []),
    {
      id: "code",
      header: "Effy code",
      cell: ({ row }) => <span className="text-xs">{row.original.code ?? "On approval"}</span>,
      meta: { label: "Effy code", align: "mono", priority: 2 },
    },
    {
      id: "sku",
      header: "Shop code",
      cell: ({ row }) => <span className="text-xs">{row.original.sku ?? "-"}</span>,
      meta: { label: "Shop code", align: "mono", priority: 2 },
    },
    {
      id: "gtin",
      header: "Barcode",
      cell: ({ row }) => <span className="text-xs">{row.original.gtin ?? "-"}</span>,
      meta: { label: "Barcode", align: "mono", priority: 3 },
    },
    {
      id: "shopPrice",
      header: "Shop price",
      cell: ({ row }) => {
        const v = row.original
        const before = was.get(v.id)
        const move = before !== undefined ? priceMove(before, v.shopPriceAmount) : null
        return (
          <>
            {before !== undefined && before !== null ? <s className="mr-1.5 text-muted-foreground">{before}</s> : null}
            <span className={before !== undefined ? "font-medium" : undefined}>{v.shopPriceAmount}</span>
            {move !== null ? (
              <span
                className={cn(
                  "block text-xs font-semibold",
                  move > PRICE_RISE_TO_LOOK_AT ? "text-accent2" : move < 0 ? "text-success" : "text-muted-foreground",
                )}
              >
                {signedPercent(move)}
              </span>
            ) : null}
            {v.shopCompareAtAmount ? (
              <span className="block text-xs text-muted-foreground line-through">{v.shopCompareAtAmount}</span>
            ) : null}
          </>
        )
      },
      meta: { label: "Shop price", align: "numeric" },
    },
    {
      id: "customerPrice",
      header: "Customers pay",
      cell: ({ row }) => {
        const v = row.original
        const preview = v.change === "removed" ? null : previewCustomerPrice(v.shopPriceAmount, entry.kind, entry.value)
        return <span className="font-medium">{preview ?? v.customerPriceAmount}</span>
      },
      meta: { label: "Customers pay", align: "numeric", phone: "trail" },
    },
    {
      id: "weight",
      header: "Weight",
      cell: ({ row }) => `${row.original.weightGrams} g`,
      meta: { label: "Weight", align: "numeric", priority: 3 },
    },
    {
      id: "pack",
      header: "Pack",
      cell: ({ row }) =>
        row.original.packQuantity ? `${Number(row.original.packQuantity)} ${row.original.packUnit ?? ""}` : "-",
      meta: { label: "Pack", priority: 2 },
    },
    {
      id: "change",
      header: () => <span className="sr-only">Change</span>,
      cell: ({ row }) => {
        const change = CHANGE_WORD[row.original.change]
        return change ? (
          <StatusWord tone={change.tone}>{change.word}</StatusWord>
        ) : row.original.state === "inactive" ? (
          <StatusWord tone="muted">Off sale</StatusWord>
        ) : null
      },
      meta: { label: "Change", phone: "badge" },
    },
  ]
}

/** The sizes under review, as a bounded table under the page's own section head; then any details that differ by size. */
export function ReviewVariants({
  variants,
  entry,
  changes,
}: {
  variants: readonly ReviewVariantDTO[]
  entry: MarginEntry
  /** The change's fields: a size's `variant:<id>:shopPriceAmount` is its price before. */
  changes: readonly { field: string; before: string | null }[]
}) {
  const named = variants.some((v) => v.label !== null)
  // Attributes marked "may differ by size" (101): each size's own values, sizes being removed left out.
  const perSize = variants.filter((v) => v.change !== "removed" && v.details.length > 0)
  const was = new Map(
    changes.flatMap((c) => {
      const m = /^variant:([^:]+):shopPriceAmount$/.exec(c.field)
      return m ? [[m[1]!, c.before] as const] : []
    }),
  )
  return (
    <div className="grid gap-8">
      <StaticTable
        label="Sizes and prices"
        columns={variantColumns(named, entry, was)}
        rows={variants}
        getRowId={(v) => v.id}
        rowClassName={(v) => (v.change === "removed" ? "text-muted-foreground" : undefined)}
      />
      {perSize.length > 0 ? (
        <div className="grid gap-4">
          <h3 className="text-[13px] font-semibold">Details that differ by size</h3>
          {perSize.map((v) => (
            <div key={v.id} className="grid gap-1">
              <p className="text-sm font-medium">{v.label ?? "This size"}</p>
              <dl className="ef-dl ef-dl--tight">
                {v.details.map((d) => (
                  <div key={d.label} className="ef-dl__row">
                    <dt>{d.label}</dt>
                    <dd className="whitespace-pre-line wrap-break-word">{d.value ?? "-"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
