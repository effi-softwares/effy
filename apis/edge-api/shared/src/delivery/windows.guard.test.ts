import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 078 — three things about delivery windows that are true only while nobody adds a second copy, and
 * that every behavioural test would go on passing without.
 *
 *   1. THE SWITCH HAS ONE READER. `delivery_settings.delivery_model_v2_from` is read by the SQL
 *      function `public.delivery_model_v2_at`, and that function by `model.ts`. A second reader is a
 *      second opinion about which checkout a customer is in: one prices a window the other refuses.
 *   2. NOTHING SETS THE SWITCH. It is turned on by the cutover, behind its readiness check — until
 *      the driver side can hold a parcel for a later day, a later-day order has nobody to deliver it.
 *   3. A WINDOW BECOMES AN INSTANT IN ONE PLACE (`clockOn` / `clockOnDate` in `slots.ts`). 058 found
 *      two calendar defects from rebuilding an instant out of wall-clock fields in more than one.
 */
const here = dirname(fileURLToPath(import.meta.url));
const services = resolve(here, "../../..");
const rel = (file: string) => relative(services, file);
const SKIP = new Set(["node_modules", "build", "dist", ".serverless", "generated"]);

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (name.endsWith(".ts") && !/\.(test|spec)\.ts$/.test(name)) out.push(path);
  }
  return out;
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sources = files(services).map((f) => ({ file: rel(f), src: stripComments(readFileSync(f, "utf8")) }));
const naming = (needle: string) => sources.filter((s) => s.src.includes(needle)).map((s) => s.file);

describe("078 — the delivery-model switch", () => {
  it("scans the services", () => {
    expect(sources.length).toBeGreaterThan(300);
  });

  it("no code names the switch column — it is read through the SQL function only", () => {
    expect(naming("delivery_model_v2_from")).toEqual([]);
  });

  it("the SQL function has ONE caller", () => {
    expect(naming("delivery_model_v2_at")).toEqual(["shared/src/delivery/model.ts"]);
  });

  it("and that caller is used by the quote alone: everything else is told by the quote", () => {
    const callers = sources.filter((s) => /deliveryModelV2At\(/.test(s.src)).map((s) => s.file);
    expect(callers.sort()).toEqual(["shared/src/delivery/model.ts", "shared/src/delivery/quote.ts"]);
  });
});

describe("078 — a window becomes an instant in one place", () => {
  it("only slots.ts turns a delivery clock into an instant", () => {
    const where = sources
      .filter((s) => /^(shared\/src\/delivery|commerce\/src|fleet\/src\/slots|fleet\/src\/deliverydays)\//.test(s.file))
      .filter((s) => !s.file.endsWith("/test-clock.ts")) // test helpers only
      .filter((s) => s.src.includes("instantAtLocalTime("))
      .map((s) => s.file);
    expect(where).toEqual(["shared/src/delivery/slots.ts"]);
  });
});
