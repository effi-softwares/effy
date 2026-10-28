import { Clock, UserX } from "lucide-react"

import type { UnassignedWorkDTO } from "@effy/shared-types"

import { Panel, EmptyState } from "@effy/web-kit/patterns"

import { describeReasons, waitingFor } from "../model"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"

export function UnassignedPanel({
  items,
  renderAssign,
}: {
  items: UnassignedWorkDTO[]
  renderAssign?: (item: UnassignedWorkDTO) => React.ReactNode
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={UserX}
        title={<span id="unassigned-heading">Nothing needs a driver</span>}
        description="Every package ready at a shop or waiting at the hub has been given to a driver."
      />
    )
  }

  return (
    <Panel
      title={
        <span id="unassigned-heading">
          Needs a driver{" "}
          <span className="font-normal text-muted-foreground">
            · {items.length} {items.length === 1 ? "package" : "packages"} with no driver
          </span>
        </span>
      }
      icon={<UserX aria-hidden="true" />}
      description="Ready at a shop or waiting at the hub. Each says why auto-assign couldn't place it."
      flush
    >
      <div className="min-w-0">
        <Table className="ef-rtable">
          <TableHeader>
            <TableRow>
              <TableHead>Package</TableHead>
              <TableHead>Why nobody has it</TableHead>
              <TableHead>Where it is</TableHead>
              <TableHead>Area</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Assign</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.packageId}>
                <TableCell data-m="primary">
                  <span className="font-mono font-medium">{item.orderNumber}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{item.shopName}</span>
                </TableCell>
                <TableCell data-m="meta">
                  <span className="font-medium">{describeReasons(item.reasons)}</span>
                </TableCell>
                <TableCell data-m="meta">
                  <span>{waitingFor(item, new Date())}</span>
                  {item.collectLate ? (
                    <span className="late ml-2">
                      <Clock aria-hidden="true" />
                      Late for its run
                    </span>
                  ) : null}
                </TableCell>
                <TableCell data-m="hide" className="text-muted-foreground">
                  {item.zoneName ?? "No area"}
                </TableCell>
                <TableCell data-m="trail" className="text-right w-auto!">
                  {renderAssign?.(item)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  )
}
