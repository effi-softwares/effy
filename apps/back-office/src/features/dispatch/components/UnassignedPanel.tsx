import { Clock, UserX } from "lucide-react"

import type { UnassignedWorkDTO } from "@effy/shared-types"

import { Panel, EmptyState } from "@effy/web-kit/patterns"

import { describeReasons, waitingFor } from "../model"

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
      <div className="ef-table-scroll">
        <table className="ef-table ef-rtable ef-table--plain">
          <thead>
            <tr>
              <th>Package</th>
              <th>Why nobody has it</th>
              <th>Where it is</th>
              <th>Area</th>
              <th className="is-actions">
                <span className="sr-only">Assign</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.packageId}>
                <td data-m="primary">
                  <span className="ef-code font-medium">{item.orderNumber}</span>
                  <span className="ef-sub">{item.shopName}</span>
                </td>
                <td data-m="meta">
                  <span className="font-medium">{describeReasons(item.reasons)}</span>
                </td>
                <td data-m="meta">
                  <span>{waitingFor(item, new Date())}</span>
                  {item.collectLate ? (
                    <span className="late ml-2">
                      <Clock aria-hidden="true" />
                      Late for its run
                    </span>
                  ) : null}
                </td>
                <td data-m="hide" className="is-muted">
                  {item.zoneName ?? "No area"}
                </td>
                <td data-m="trail" className="is-actions w-auto!">
                  {renderAssign?.(item)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
