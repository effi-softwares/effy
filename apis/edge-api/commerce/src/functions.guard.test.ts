import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { functionBlocks } from "./config.contract.test";

/**
 * A route with the customer authorizer must use `customerRoute`, which checks `public.customer`
 * (barred, closing) before the handler; the gateway only proves the token. Every function also
 * goes through the overload wrapper.
 */

const here = dirname(fileURLToPath(import.meta.url));
const functionsDir = resolve(here, "functions");
const blocks = functionBlocks();

const HEALTH = new Set(["healthz-get", "readyz-get"]);

const fileOf = (block: string) => /handler: src\/functions\/([a-z0-9-]+)\.handler/.exec(block)?.[1];
const source = (file: string) => readFileSync(resolve(functionsDir, `${file}.ts`), "utf8");

const declared = [...blocks].map(([name, block]) => ({
  name,
  file: fileOf(block)!,
  http: block.includes("httpApi:"),
  authed: block.includes("/edge/authorizer/customer_id"),
}));

describe("commerce functions", () => {
  it("every declared handler has a source file, and every source file is deployed", () => {
    expect(declared.filter((d) => !d.file || !existsSync(resolve(functionsDir, `${d.file}.ts`))).map((d) => d.name)).toEqual([]);
    const files = readdirSync(functionsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => f.slice(0, -3));
    expect(files.filter((f) => !declared.some((d) => d.file === f))).toEqual([]);
  });

  const authed = declared.filter((d) => d.authed);
  const unauthed = declared.filter((d) => d.http && !d.authed && !HEALTH.has(d.file));
  /** Run by a schedule: no shopper, no gateway. */
  const scheduled = declared.filter((d) => !d.http);

  it("there are authenticated routes to check", () => {
    expect(authed.length).toBeGreaterThan(0);
  });

  it.each(authed)("$name ($file) is a customerRoute — it cannot serve a barred or closing shopper", ({ file }) => {
    expect(source(file)).toMatch(/export const handler = customerRoute\(/);
  });

  it.each(unauthed)("$name ($file) goes through the overload wrapper and resolves no customer", ({ file }) => {
    const src = source(file);
    expect(src).toMatch(/export const handler = (publicRoute|shopperHandler)\(/);
    // Without an authorizer there is no verified subject to resolve a customer from.
    expect(src).not.toMatch(/customerRoute\(|resolveCustomer\(/);
  });

  it("the only functions that are not routes are the ones named here", () => {
    // A function with no HTTP event escapes every route rule above.
    expect(scheduled.map((d) => d.name)).toEqual(["refundReconcile"]);
    for (const d of scheduled) expect(source(d.file)).not.toMatch(/customerRoute\(|publicRoute\(/);
  });

  it("no function file resolves the customer by hand", () => {
    for (const d of declared) {
      if (HEALTH.has(d.file)) continue;
      expect(source(d.file), `${d.file} must use customerRoute, not call resolveCustomer itself`).not.toMatch(/resolveCustomer\(/);
    }
  });
});
