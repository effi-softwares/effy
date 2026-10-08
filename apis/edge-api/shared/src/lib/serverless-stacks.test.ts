import { describe, expect, it } from "vitest";

import { functionsOf, httpRoutes, listStacks } from "./serverless-stacks.js";

describe("serverless-stacks — the reader every stack guard depends on", () => {
  const stacks = listStacks();

  it("finds every service directory that deploys", () => {
    const dirs = new Set(stacks.map((s) => s.dir));
    for (const d of ["admin", "auth", "catalog", "commerce", "customer", "driver", "fleet", "inventory", "live", "notifications", "orders", "shop", "storefront"]) {
      expect(dirs, `${d} has no serverless*.yml`).toContain(d);
    }
    expect(dirs).not.toContain("shared");
    expect(dirs).not.toContain("ops");
  });

  it("gives every stack a distinct name", () => {
    const names = stacks.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("reads routes: a method, a path, and where the authorizer comes from", () => {
    const routes = stacks.flatMap(httpRoutes);
    expect(routes.length).toBeGreaterThan(250);
    for (const r of routes) {
      expect(r.method).toMatch(/^(GET|POST|PUT|PATCH|DELETE|ANY|\*)$/);
      expect(r.path.startsWith("/")).toBe(true);
    }
    expect(routes.some((r) => r.authorizerParam === null)).toBe(true);
    expect(routes.some((r) => r.authorizerParam?.endsWith("/authorizer/customer_id"))).toBe(true);
  });

  it("a stack with routes names a gateway, and a stack without routes names none", () => {
    for (const s of stacks) {
      const n = httpRoutes(s).length;
      if (n > 0) expect(s.gateway, `${s.dir}/${s.file} has ${n} routes and no gateway`).not.toBeNull();
    }
  });

  it("reads scheduled functions", () => {
    expect(stacks.flatMap(functionsOf).filter((f) => f.scheduled).length).toBeGreaterThanOrEqual(8);
  });
});
