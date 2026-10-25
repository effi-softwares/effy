import type { StockMovementDTO } from "@effy/shared-types"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"

import { actorLabel, formatDelta, reasonLabel } from "./stockMovementText"

export function StockHistory({ movements }: { movements: StockMovementDTO[] }) {
  return (
    <section className="space-y-3">
      {movements.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No stock changes recorded yet. Every change to the count appears here, with who made it and why.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Count</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">{formatWhen(m.createdAt)}</TableCell>
                  <TableCell className="tabular-nums">{formatDelta(m.quantityDelta)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {m.quantityBefore} → {m.quantityAfter}
                  </TableCell>
                  <TableCell>{reasonLabel(m)}</TableCell>
                  <TableCell>{actorLabel(m)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}
