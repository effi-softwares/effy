import { describe, expect, it } from "vitest";

import { functionsOf, listStacks, type Gateway } from "./serverless-stacks.js";

/**
 * ⚠ A GATEWAY HAS A CEILING, AND UNTIL 075 NOTHING COUNTED TOWARDS IT.
 *
 * An HTTP API holds at most 300 routes and 300 integrations. The route limit can be raised by a
 * quota request. The integration limit CANNOT — it is not in the provider's list of adjustable
 * quotas — and the deployment framework creates one integration per function that has a route.
 *
 * On 2026-10-08 the shared gateway held 299 of each. A feature added two routes; the deployment was
 * refused half-way through, in the provider's words and nobody's test, and the feature shipped only
 * by merging two routes into one. Every check had passed. This is the check that would not have.
 *
 * It counts what the tree is ABOUT to deploy. What is really deployed is read by
 * `make gateway-usage` and, hourly, by the `gatewayUsage` function — the two can differ while a
 * stack is waiting to be deployed.
 *
 * ⚠ When this fails, do NOT merge routes to fit, and do not raise the constant. The rule for what
 * to do is in docs/api/path-assignment.md ("When a gateway nears its ceiling").
 */

/** Both limits, per HTTP API. Integrations is the one that cannot be raised (075 research F1). */
const GATEWAY_CEILING = 300;

function usage() {
  const rows: Record<Gateway, { routes: number; integrations: number; stacks: Record<string, number> }> = {
    shared: { routes: 0, integrations: 0, stacks: {} },
    staff: { routes: 0, integrations: 0, stacks: {} },
  };
  for (const stack of listStacks()) {
    if (!stack.gateway) continue;
    const fns = functionsOf(stack);
    const routes = fns.reduce((n, f) => n + f.routes.length, 0);
    const row = rows[stack.gateway];
    row.routes += routes;
    // One integration per FUNCTION that has a route, however many routes it serves.
    row.integrations += fns.filter((f) => f.routes.length > 0).length;
    row.stacks[stack.name] = routes;
  }
  return rows;
}

describe("gateway capacity — neither gateway is asked to hold more than it can", () => {
  const rows = usage();

  it("prints how full each gateway would be", () => {
    console.table(
      Object.entries(rows).map(([gateway, r]) => ({
        gateway,
        routes: `${r.routes} / ${GATEWAY_CEILING}`,
        integrations: `${r.integrations} / ${GATEWAY_CEILING}`,
        percent: `${Math.ceil((Math.max(r.routes, r.integrations) / GATEWAY_CEILING) * 100)}%`,
        stacks: Object.entries(r.stacks).map(([s, n]) => `${s} ${n}`).join(" · "),
      })),
    );
    expect(rows.shared.routes).toBeGreaterThan(0);
  });

  it.each(["shared", "staff"] as const)("%s gateway: routes and integrations are within the ceiling", (gateway) => {
    const r = rows[gateway];
    const where = `the ${gateway} gateway would hold`;
    const what = "— the deployment WILL be refused. See docs/api/path-assignment.md, \"When a gateway nears its ceiling\".";
    expect(r.routes, `${where} ${r.routes} routes of ${GATEWAY_CEILING} ${what}`).toBeLessThanOrEqual(GATEWAY_CEILING);
    expect(r.integrations, `${where} ${r.integrations} integrations of ${GATEWAY_CEILING} ${what}`).toBeLessThanOrEqual(GATEWAY_CEILING);
  });
});
