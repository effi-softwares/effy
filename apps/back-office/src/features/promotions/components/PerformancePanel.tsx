import { useQuery } from "@tanstack/react-query";

import { Panel } from "@/components/patterns/Panel";

import { performanceQuery } from "../queries";

/**
 * How a promotion is doing: uses, customers, discount given, orders and sales, over its
 * lifetime and the last 7 and 30 days — rows in a table, not metric tiles (Principle V).
 */
export function PerformancePanel({ promotionId }: { promotionId: string }) {
  const { data } = useQuery(performanceQuery(promotionId));
  if (!data) return null;
  const cols = [
    ["Last 7 days", data.last7],
    ["Last 30 days", data.last30],
    ["Lifetime", data.lifetime],
  ] as const;
  const rows: { label: string; value: (w: (typeof cols)[number][1]) => string }[] = [
    { label: "Uses", value: (w) => w.uses.toLocaleString("en-AU") },
    { label: "Customers", value: (w) => w.customers.toLocaleString("en-AU") },
    { label: "Discount given", value: (w) => `$${w.discount}` },
    { label: "Orders", value: (w) => w.orders.toLocaleString("en-AU") },
    { label: "Sales", value: (w) => `$${w.sales}` },
  ];
  return (
    <Panel title="Performance" description={data.budgetLeft ? `$${data.budgetLeft} of its budget left.` : "Paid orders only."} flush>
      <div className="bo-table-scroll">
        <table className="bo-table">
          <thead>
            <tr>
              <th />
              {cols.map(([l]) => (
                <th key={l} className="text-right">
                  {l}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {cols.map(([l, w]) => (
                  <td key={l} className="text-right tabular-nums">
                    {r.value(w)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
