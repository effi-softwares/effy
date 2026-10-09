import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 082 P12 — driver work no longer knows a delivery METHOD, which every behavioural test would go on
 * passing without:
 *
 *   1. Nothing in fleet names a clearance's method. A clearance is (function, area), and since 083
 *      the column does not exist — a reader that came back would fail at run time, in production.
 *   2. Nothing in fleet or the orders console decides driver work from `delivery_method = 'same_day'`.
 *      Who delivers a parcel is 079's one definition (`package_delivered_by`); since 078 a later-day
 *      window is sold as `standard`, and a method test gives it no delivery round at all.
 */
const here = dirname(fileURLToPath(import.meta.url));
const services = resolve(here, "../..");

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".serverless" || name === "build" || name === "dist") continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name)) out.push(path);
  }
  return out;
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|--).*$/gm, "");
const read = (dir: string) => files(resolve(services, dir)).map((f) => ({ file: relative(services, f), src: strip(readFileSync(f, "utf8")) }));
const fleet = read("fleet/src");
const ordersConsole = read("orders/src/orders");
const naming = (sources: typeof fleet, re: RegExp) => sources.filter((s) => re.test(s.src)).map((s) => s.file).sort();

describe("082 — driver work has no delivery method", () => {
  it("scans the services", () => {
    expect(fleet.length).toBeGreaterThan(60);
    expect(ordersConsole.length).toBeGreaterThan(2);
  });

  it("nothing in fleet reads a clearance's method", () => {
    expect(naming(fleet, /\b(c|cap|needed|capd)\.method\b/)).toEqual([]);
    expect(naming(fleet, /'method',\s*c\.method/)).toEqual([]);
  });

  it("a clearance is written in ONE place, and names no method (083: the column is gone)", () => {
    expect(naming(fleet, /INSERT INTO public\.driver_zone_capability/)).toEqual(["fleet/src/capabilities/repository.ts"]);
    const repo = fleet.find((s) => s.file === "fleet/src/capabilities/repository.ts")!.src;
    expect(repo).toMatch(/INSERT INTO public\.driver_zone_capability \(driver_id, function, zone_id, granted_by_sub\)/);
    expect(naming(fleet, /UNREAD_METHOD/)).toEqual([]);
  });

  it("no driver work is decided from delivery_method = 'same_day'", () => {
    const methodTest = /delivery_method\s*=\s*'same_day'|opd\.method\s*=\s*'same_day'|method\s*===\s*"same_day"/;
    expect(naming(fleet, methodTest)).toEqual([]);
    expect(naming(ordersConsole, methodTest)).toEqual([]);
  });

  it("the planner, dispatch and assignments carry no method literal at all", () => {
    const scoped = fleet.filter((s) => /fleet\/src\/(planner|dispatch|assignments|capabilities|coverage)\//.test(s.file));
    expect(naming(scoped, /'same_day'|"same_day"/)).toEqual([]);
    expect(naming(scoped, /'standard'|"standard"/)).toEqual([]);
  });
});
