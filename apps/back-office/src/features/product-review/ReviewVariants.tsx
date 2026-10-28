import type { ReviewVariantDTO } from "@effy/shared-types"

import { StaticTable, type EffyColumnDef } from "@effy/web-kit/data-table"
import { Panel, StatusWord, type StatusTone } from "@effy/web-kit/patterns"

import { previewCustomerPrice, type MarginEntry } from "./model"

const CHANGE_WORD: Record<ReviewVariantDTO["change"], { word: string; tone: StatusTone } | null> = {
  added: { word: "New", tone: "info" },
  changed: { word: "Changed", tone: "waiting" },
  removed: { word: "Removed", tone: "muted" },
  unchanged: null,
}

/** The sizes under review, each as it will be after the decision (103: a bounded table, no pager). */
function variantColumns(named: boolean, entry: MarginEntry): EffyColumnDef<ReviewVariantDTO>[] {
  return [
    ...(named
      ? [
          {
            id: "size",
            header: "Size",
            cell: ({ row }) => <span className="font-medium">{row.original.label ?? "—"}</span>,
            meta: { label: "Size", identifying: true, phone: "primary" },
          } satisfies EffyColumnDef<ReviewVariantDTO>,
        ]
      : []),
    { id: "code", header: "Effy code", cell: ({ row }) => <span className="text-xs">{row.original.code ?? "On approval"}</span>, meta: { label: "Effy code", align: "mono", priority: 2 } },
    { id: "sku", header: "Shop code", cell: ({ row }) => <span className="text-xs">{row.original.sku ?? "—"}</span>, meta: { label: "Shop code", align: "mono", priority: 2 } },
    { id: "gtin", header: "Barcode", cell: ({ row }) => <span className="text-xs">{row.original.gtin ?? "—"}</span>, meta: { label: "Barcode", align: "mono", priority: 3 } },
    {
      id: "shopPrice",
      header: "Shop price",
      cell: ({ row }) => (
        <>
          {row.original.shopPriceAmount}
          {row.original.shopCompareAtAmount ? (
            <span className="block text-xs text-muted-foreground line-through">{row.original.shopCompareAtAmount}</span>
          ) : null}
        </>
      ),
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
    { id: "weight", header: "Weight", cell: ({ row }) => `${row.original.weightGrams} g`, meta: { label: "Weight", align: "numeric", priority: 3 } },
    {
      id: "pack",
      header: "Pack",
      cell: ({ row }) => (row.original.packQuantity ? `${Number(row.original.packQuantity)} ${row.original.packUnit ?? ""}` : "—"),
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
      <StaticTable
        label="Sizes and prices"
        columns={variantColumns(named, entry)}
        rows={variants}
        getRowId={(v) => v.id}
        rowClassName={(v) => (v.change === "removed" ? "text-muted-foreground" : undefined)}
        framed={false}
      />
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
