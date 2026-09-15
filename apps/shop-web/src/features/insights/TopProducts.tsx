import { Link } from "@tanstack/react-router"

import type { InsightsRange, InsightsTopProductDTO } from "@effy/shared-types"

import { money, RANGE_PERIOD } from "./model"

/**
 * Top products by revenue (058, US3).
 *
 * ⚠ THE SUBTITLE NAMES A PERIOD, NEVER THE CHART'S BUCKET. "By revenue, last 7 days" — not "By
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
    <section className="max-w-[760px]">
      <header className="flex flex-wrap items-baseline gap-3 border-b pb-3">
        <div className="grid gap-[3px]">
          <h2 className="text-sm font-semibold">Top products</h2>
          <p className="text-muted-foreground text-[12.5px]">By revenue, {RANGE_PERIOD[range]}</p>
        </div>
        <div className="flex-1" />
        <Link
          to="/catalog"
          className="text-muted-foreground hover:text-foreground text-[13px] font-medium no-underline"
        >
          Catalog →
        </Link>
      </header>

      {products.length === 0 ? (
        <p className="text-muted-foreground py-8 text-sm">Nothing sold in this window yet.</p>
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {products.map((p) => (
              <tr key={p.productId} className="hover:bg-accent border-b">
                <td className="w-[38px] py-3.5 pr-2">
                  {p.thumbnailUrl ? (
                    <img
                      src={p.thumbnailUrl}
                      alt=""
                      className="bg-muted size-[30px] rounded-md border object-cover"
                    />
                  ) : (
                    <div className="bg-muted size-[30px] rounded-md border" />
                  )}
                </td>
                <td className="px-2 py-3.5">
                  <Link
                    to="/catalog/$productId"
                    params={{ productId: p.productId }}
                    className="block truncate text-[13.5px] font-medium no-underline"
                  >
                    {p.name}
                  </Link>
                  <span className="text-muted-foreground font-mono text-xs">{p.sku ?? "—"}</span>
                </td>
                <td className="w-[34%] px-2 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-muted h-[5px] min-w-10 flex-1 overflow-hidden rounded-full">
                      <div
                        className="bg-primary h-full"
                        style={{ width: `${Math.round(p.share * 100)}%` }}
                      />
                    </div>
                    <span className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                      {p.units} units
                    </span>
                  </div>
                </td>
                <td className="w-[100px] py-3.5 pl-2 text-right text-[13.5px] font-medium tabular-nums whitespace-nowrap">
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
