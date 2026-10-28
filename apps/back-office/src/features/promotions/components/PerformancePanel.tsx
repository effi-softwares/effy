import { useQuery } from "@tanstack/react-query"

import { Panel } from "@effy/web-kit/patterns"

import { performanceQuery } from "../queries"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"

export function PerformancePanel({ promotionId }: { promotionId: string }) {
  const { data } = useQuery(performanceQuery(promotionId))
  if (!data) return null
  const cols = [
    ["Last 7 days", data.last7],
    ["Last 30 days", data.last30],
    ["Lifetime", data.lifetime],
  ] as const
  const rows: { label: string; value: (w: (typeof cols)[number][1]) => string }[] = [
    { label: "Uses", value: (w) => w.uses.toLocaleString("en-AU") },
    { label: "Customers", value: (w) => w.customers.toLocaleString("en-AU") },
    { label: "Discount given", value: (w) => `$${w.discount}` },
    { label: "Orders", value: (w) => w.orders.toLocaleString("en-AU") },
    { label: "Sales", value: (w) => `$${w.sales}` },
  ]
  return (
    <Panel
      title="Performance"
      description={data.budgetLeft ? `$${data.budgetLeft} of its budget left.` : "Paid orders only."}
      flush
    >
      <div className="min-w-0">
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
                    {r.value(w)}
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
