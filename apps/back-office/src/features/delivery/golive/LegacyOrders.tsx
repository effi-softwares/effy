import { Link } from "@tanstack/react-router";

import type { GoLiveLegacy } from "@effy/shared-types";

import { melbourneMoment } from "./words";

/**
 * Orders sold the old way that are still open (083 US4) — shown once the switch is on.
 * ⚠ The count and the list it links to are one definition on the server; they cannot disagree.
 */
export function LegacyOrders({ legacy }: { legacy: GoLiveLegacy }) {
  return (
    <section className="space-y-2" aria-labelledby="golive-legacy">
      <h2 id="golive-legacy" className="text-base font-semibold">Orders sold the old way</h2>
      {legacy.open === 0 ? (
        <p className="text-sm" data-testid="legacy-none">
          No old order remains open{legacy.lastClosedAt ? ` — the last one closed ${melbourneMoment(legacy.lastClosedAt)}` : ""}.
        </p>
      ) : (
        <p className="text-sm" data-testid="legacy-open">
          <Link to="/orders" search={{ delivery: "legacy", open: true }} className="font-medium text-primary underline-offset-4 hover:underline">
            {legacy.open} old order{legacy.open === 1 ? "" : "s"} still open
          </Link>
          {" "}— each keeps what it was sold and finishes that way.
        </p>
      )}
      <p className="max-w-2xl text-sm text-muted-foreground">
        The old arrangement can be removed only when none remains. An alert is raised if any is still open {legacy.alertAfterDays} days after the switch.
      </p>
    </section>
  );
}
