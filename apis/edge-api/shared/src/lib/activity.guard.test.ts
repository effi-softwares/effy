import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EDGE_API_DIR, functionsOf, listStacks } from "./serverless-stacks";

/**
 * 104: every activity log in back-office and shop-web is answered by `activityResponse` - one way to page,
 * search, filter and export a log - and no route keeps a log of its own beside it.
 */
const ACTIVITY_ROUTES = [
  "/orders/v1/orders/{orderId}/activity",
  "/admin/v1/shops/{shopId}/audit",
  "/fleet/v1/drivers/{driverId}/audit",
  "/fleet/v1/vehicles/{vehicleId}/activity",
  "/catalog/v1/products/{productId}/activity",
  "/admin/v1/promotions/{id}/audit",
  "/orders/v1/customers/{customerId}/points/history",
  "/orders/v1/points/settings/activity",
  "/admin/v1/deliverability/{address}/activity",
  "/shop/v1/team-activity",
  "/shop/v1/orders/{id}/activity",
  "/inventory/v1/products/{productId}/stock/activity",
] as const;

function handlerFileOf(path: string): string {
  for (const stack of listStacks()) {
    for (const fn of functionsOf(stack)) {
      if (fn.routes.some((r) => r.path === path && r.method.toUpperCase() === "GET")) {
        return `${stack.dir}/${fn.handler.replace(/\.[A-Za-z]+$/, "")}.ts`;
      }
    }
  }
  throw new Error(`no GET route ${path} in any stack`);
}

describe("every activity log goes through activityResponse (104)", () => {
  it.each(ACTIVITY_ROUTES)("%s answers with activityResponse", (path) => {
    const text = readFileSync(resolve(EDGE_API_DIR, handlerFileOf(path)), "utf8");
    expect(text, `${path} must answer through activityResponse`).toMatch(/\bactivityResponse\(/);
  });

  it("names every route that answers with activityResponse", () => {
    const routed = listStacks().flatMap((stack) =>
      functionsOf(stack).flatMap((fn) => {
        let text = "";
        try {
          text = readFileSync(
            resolve(EDGE_API_DIR, `${stack.dir}/${fn.handler.replace(/\.[A-Za-z]+$/, "")}.ts`),
            "utf8",
          );
        } catch {
          return [];
        }
        return /\bactivityResponse\(/.test(text) ? fn.routes.map((r) => r.path) : [];
      }),
    );
    expect([...new Set(routed)].sort()).toEqual([...ACTIVITY_ROUTES].sort());
  });
});
