import { Link } from "@tanstack/react-router"

import type { InsightsRange, InsightsTopProductDTO } from "@effy/shared-types"
import { Progress } from "@effy/design-system/ui"

import { money, RANGE_PERIOD } from "./model"

/**
 * Top products by revenue.
 *
 * The subtitle names a period, never the chart's bucket. "By revenue, last 7 days" — not "By
 * revenue, by day". The imported design reused its chart-window label here, which reads as though the
 * list itself were bucketed and quietly answers a different question from the one asked.
 */
export function TopProducts({
  products,
  range,
  currency,
}: {
  products: readonly InsightsTopProductDTO[]
  range: InsightsRange
  currency: string
}) {
  return (
    <section className="bo-panel min-w-0">
      <header className="bo-panel__head">
        <div className="grid gap-0.5">
          <h2 className="bo-panel__title">Top products</h2>
          <p className="bo-panel__desc">By revenue, {RANGE_PERIOD[range]}</p>
        </div>
        <Link to="/catalog" className="text-sm font-medium text-foreground no-underline hover:underline">
          Catalog →
        </Link>
      </header>

      {products.length === 0 ? (
        <p className="px-5 py-8 text-muted-foreground">Nothing sold in this window yet.</p>
      ) : (
        <table className="bo-table">
          <tbody>
            {products.map((p) => (
              <tr key={p.productId}>
                <td className="w-[64px]">
                  {p.thumbnailUrl ? (
                    <img
                      src={p.thumbnailUrl}
                      alt=""
                      className="size-10 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <div className="bo-img size-10" />
                  )}
                </td>
                <td>
                  <Link
                    to="/catalog/$productId"
                    params={{ productId: p.productId }}
                    className="block truncate font-medium text-foreground no-underline hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="bo-sub font-mono">{p.sku ?? "—"}</span>
                </td>
                <td className="w-[34%]">
                  <div className="flex items-center gap-2.5">
                    {/* The shared Progress primitive, on the brand tone — this bar measures a
                        share of revenue, which is money, and money is the first chart series too.
                        It was a hand-rolled track with no aria at all, so a screen reader was told
                        nothing about the ranking this column exists to show. */}
                    <Progress
                      className="min-w-10 flex-1"
                      height={5}
                      tone="brand"
                      value={Math.round(p.share * 100)}
                      label={`${p.name}: share of revenue`}
                    />
                    <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
                      {p.units} units
                    </span>
                  </div>
                </td>
                <td className="is-num w-[110px] font-semibold whitespace-nowrap">
                  {money(p.revenue, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
