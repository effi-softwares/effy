import type { UnassignedWorkDTO } from "@effy/shared-types";

import { describeReasons } from "../model";

/**
 * Work nobody could take, and why (FR-028, SC-003).
 *
 * ⚠ THIS SECTION COMES FIRST ON THE PAGE, ABOVE EVERYTHING PROCEEDING NORMALLY. The whole premise of
 * the engine is that it may fail to assign but may never fail QUIETLY — 056's finding was two tables
 * written for a reader that did not exist, and this is that reader. A dispatcher who has to scroll
 * past healthy rounds to find the stuck package is being asked to do the engine's job.
 *
 * ⚠ It is a LIST, not cards (Principle V). Each row is a package with a reason; a card grid would
 * make eight stuck packages look like a dashboard rather than a queue of things to fix.
 */
export function UnassignedPanel({ items }: { items: UnassignedWorkDTO[] }) {
  if (items.length === 0) {
    // ⚠ A STATED FACT, not blank space. "Nothing is stuck" is information; an empty region is
    // indistinguishable from a screen that failed to load.
    return (
      <section aria-labelledby="unassigned-heading" className="border-b border-border pb-6">
        <h2 id="unassigned-heading" className="text-base font-medium">
          Nothing needs attention
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every package that is ready has been given to a driver.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="unassigned-heading" className="border-b border-border pb-6">
      <h2 id="unassigned-heading" className="text-base font-medium">
        Needs attention
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {items.length} {items.length === 1 ? "package" : "packages"} with no driver
        </span>
      </h2>

      <ul className="mt-3 divide-y divide-border">
        {items.map((item) => (
          <li key={item.packageId} className="flex items-baseline justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {item.orderNumber}
                <span className="ml-2 font-normal text-muted-foreground">{item.shopName}</span>
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {describeReasons(item.reasons)}
              </p>
            </div>
            <div className="shrink-0 text-right text-sm text-muted-foreground">
              <p>{item.zoneName ?? "No zone"}</p>
              <p>{item.method === "same_day" ? "Same-day" : "Standard"}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
