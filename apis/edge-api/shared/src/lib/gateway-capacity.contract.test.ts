import { describe, expect, it } from "vitest";

import { functionsOf, listStacks, type Gateway } from "./serverless-stacks.js";

/**
 * An HTTP API holds at most 300 routes and 300 integrations, and the integration limit cannot be raised
 * (one per routed function). This counts what the tree would deploy; `make gateway-usage` and the hourly
 * `gatewayUsage` read what is deployed. When it fails, do not merge routes or raise the constant: see
 * docs/api/path-assignment.md.
 */

/** Per HTTP API. Integrations cannot be raised. */
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
    // One integration per function with a route, however many routes it serves.
    row.integrations += fns.filter((f) => f.routes.length > 0).length;
    row.stacks[stack.name] = routes;
  }
  return rows;
}

describe("gateway capacity - neither gateway is asked to hold more than it can", () => {
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
    const what = "- the deployment WILL be refused. See docs/api/path-assignment.md, \"When a gateway nears its ceiling\".";
    expect(r.routes, `${where} ${r.routes} routes of ${GATEWAY_CEILING} ${what}`).toBeLessThanOrEqual(GATEWAY_CEILING);
    expect(r.integrations, `${where} ${r.integrations} integrations of ${GATEWAY_CEILING} ${what}`).toBeLessThanOrEqual(GATEWAY_CEILING);
  });
});
