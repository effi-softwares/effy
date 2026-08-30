import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { READY_TO_COLLECT, READY_TO_DELIVER } from "./sql";

/**
 * ⚠ THE DUTY SCREEN AND THE ASSIGNMENT SWEEP MUST AGREE ABOUT WHAT "WAITING FOR A DRIVER" MEANS.
 *
 * The console's unassigned-work count exists to answer one question — "why is nothing moving?" — and
 * the only answer that helps is the one the sweep would give. If this service derived the count its
 * own way, the two would drift the first time either changed, and the screen would be confidently
 * wrong about the single thing it is for.
 *
 * This is the shape 029 used to keep the storefront home read and the promotion detail read from
 * disagreeing about whether a promotion was still visible, and 054 used to keep fourteen copies of
 * `p.status = 'active'` from becoming fourteen different availability rules.
 *
 * We cannot import from `apis/edge-api/driver` (a separate deployable), so the parity is asserted
 * against its SOURCE. Reading the file is the point: a change there fails HERE, naming the drift.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sweepSource = readFileSync(
  resolve(here, "..", "..", "..", "driver", "src", "assignment", "repository.ts"),
  "utf8",
);

/** Collapse whitespace so formatting differences are not reported as drift. */
function normalise(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("assignment parity — the console sees what the sweep sees", () => {
  it("uses the sweep's ready-to-collect terms", () => {
    const ours = normalise(READY_TO_COLLECT);
    const theirs = normalise(sweepSource);

    // The three terms that define a collectable package. Each is asserted separately so a failure
    // names WHICH half of the definition moved.
    expect(ours).toContain("sf.status = 'ready_for_pickup'");
    expect(theirs, "the sweep no longer selects on ready_for_pickup").toContain(
      "sf.status = 'ready_for_pickup'",
    );

    expect(ours).toContain(
      "not exists ( select 1 from public.collection_task ct where ct.shop_fulfillment_id = sf.id )",
    );
    expect(
      theirs,
      "the sweep no longer excludes packages already claimed by a collection_task",
    ).toContain("not exists (select 1 from public.collection_task ct where ct.shop_fulfillment_id = sf.id)");
  });

  it("uses the sweep's ready-to-deliver terms", () => {
    const ours = normalise(READY_TO_DELIVER);

    // A same-day package checked in at the hub and not yet grouped into a drop.
    expect(ours).toContain("opd.method = 'same_day'");
    expect(ours).toContain("sf.status = 'collected'");
    expect(ours).toContain("public.delivery_task_package dtp");

    const theirs = normalise(sweepSource);
    expect(theirs, "the sweep no longer keys same-day on order_package_delivery.method").toContain(
      "opd.method = 'same_day'",
    );
  });

  it("⚠ the sweep still leaves started work behind — which is why stranded work exists at all", () => {
    // `releaseIneligibleWork` deliberately releases ONLY not-yet-started work. If that ever changed
    // to release picked-up work too, the stranded reader would be reporting a state the platform no
    // longer produces, and this feature's central hazard would have quietly moved.
    const theirs = normalise(sweepSource);
    expect(theirs).toContain("ct.status in ('assigned', 'en_route')");
    expect(theirs).toContain("dt.status = 'staged'");
    expect(
      theirs,
      "the sweep now releases collected packages — stranded-work detection must be revisited",
    ).not.toContain("ct.status in ('collected'");
  });
});
