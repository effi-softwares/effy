import { Link } from "@tanstack/react-router"

import type { InsightsRange, InsightsTopProductDTO } from "@effy/shared-types"
import { Button, Progress, Table, TableBody, TableCell, TableRow } from "@effy/design-system/ui"
import { Panel } from "@effy/web-kit/patterns"

import { money, RANGE_PERIOD } from "./model"

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
    <Panel
      flush
      title="Top products"
      description={`By revenue, ${RANGE_PERIOD[range]}`}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/catalog">Catalog →</Link>
        </Button>
      }
    >
      {products.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground">Nothing sold in this window yet.</p>
      ) : (
        <Table>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.productId}>
                <TableCell className="w-16">
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt="" className="size-10 rounded-md border object-cover" />
                  ) : (
                    <div className="size-10 rounded-md bg-muted" />
                  )}
                </TableCell>
                <TableCell className="max-w-0">
                  <Link
                    to="/catalog/$productId"
                    params={{ productId: p.productId }}
                    className="block truncate font-medium text-foreground no-underline hover:underline"
                  >
                    {p.name}
                  </Link>
                  <span className="mt-0.5 block font-mono text-muted-foreground">{p.sku ?? "—"}</span>
                </TableCell>
                <TableCell className="w-[34%]">
                  <div className="flex items-center gap-3">
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
                </TableCell>
                <TableCell numeric className="w-28 font-semibold">
                  {money(p.revenue, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  )
}
