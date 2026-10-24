import { Clock, UserX } from "lucide-react";

import type { UnassignedWorkDTO } from "@effy/shared-types";

import { Panel } from "@effy/web-kit/patterns";
import { EmptyState } from "@effy/web-kit/patterns";

import { describeReasons, waitingFor } from "../model";

/**
 * "Needs a driver" (redesign, board "Dispatch — today"): every package ready at a shop or waiting at
 * the hub that nobody has, and why auto-assign could not place it.
 *
 * The reader that makes an unassigned package explainable. Every reason is shown, in words
 * (`describeReasons`), never a code — a person fixes a licence, not `licence_expired`.
 */
export function UnassignedPanel({
  items,
  renderAssign,
}: {
  items: UnassignedWorkDTO[];
  renderAssign?: (item: UnassignedWorkDTO) => React.ReactNode;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={UserX}
        title={<span id="unassigned-heading">Nothing needs a driver</span>}
        description="Every package ready at a shop or waiting at the hub has been given to a driver."
      />
    );
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
      <div className="bo-table-scroll">
        <table className="bo-table bo-rtable bo-table--plain">
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
                  <span className="bo-code font-medium">{item.orderNumber}</span>
                  <span className="bo-sub">{item.shopName}</span>
                </td>
                <td data-m="meta">
                  <span className="font-medium">{describeReasons(item.reasons)}</span>
                </td>
                <td data-m="meta">
                  {/* Where it is and what it is waiting for. A package readied in the evening for
                      tomorrow's run is not the same problem as one whose run opens in ten minutes. */}
                  <span>{waitingFor(item, new Date())}</span>
                  {/* Still at its supplier after the run that would have made its window. */}
                  {item.collectLate ? (
                    <span className="bo-late ml-2">
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
  );
}
