import { useQuery } from "@tanstack/react-query"

import { Bone, Panel } from "@effy/web-kit/patterns"

import { performanceQuery } from "../queries"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"

export function PerformancePanel({ promotionId }: { promotionId: string }) {
  const { data, isError } = useQuery(performanceQuery(promotionId))
  if (isError) return null
  // While it reads, the same matrix with a bone in each figure.
  const cols = [
    ["Last 7 days", data?.last7],
    ["Last 30 days", data?.last30],
    ["Lifetime", data?.lifetime],
  ] as const
  const rows: { label: string; value: (w: NonNullable<(typeof cols)[number][1]>) => string }[] = [
    { label: "Uses", value: (w) => w.uses.toLocaleString("en-AU") },
    { label: "Customers", value: (w) => w.customers.toLocaleString("en-AU") },
    { label: "Discount given", value: (w) => `$${w.discount}` },
    { label: "Orders", value: (w) => w.orders.toLocaleString("en-AU") },
    { label: "Sales", value: (w) => `$${w.sales}` },
  ]
  return (
    <Panel
      title="Performance"
      description={
        !data ? (
          <Bone kind="small" className="mt-1 w-40" />
        ) : data.budgetLeft ? (
          `$${data.budgetLeft} of its budget left.`
        ) : (
          "Paid orders only."
        )
      }
      flush
    >
      <div className="min-w-0" aria-busy={!data || undefined}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              {cols.map(([l]) => (
                <TableHead key={l} className="text-right">
                  {l}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.label}>
                <TableCell>{r.label}</TableCell>
                {cols.map(([l, w]) => (
                  <TableCell key={l} className="text-right tabular-nums">
                    {w ? r.value(w) : <Bone className="ml-auto w-12" />}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  )
}
