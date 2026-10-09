import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 078 — three things about delivery windows that are true only while nobody adds a second copy, and
 * that every behavioural test would go on passing without.
 *
 *   1. NOTHING READS THE SWITCH TO DECIDE ANYTHING (083 stage 2). There is one delivery model; the
 *      column is the record of when it began, and only the go-live repository names it.
 *   2. THE SWITCH HAS ONE WRITER (083): the back-office go-live setter, behind its readiness check
 *      and beside its audit row. Nothing else sets it.
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

  /**
   * ⚠ 083 — THE SWITCH HAS ONE WRITER, and it is the only code that names the column. It writes
   * behind the readiness check and beside its audit row; a second writer is a way to turn the new
   * checkout on with no plan to price it and nobody on the record for having done it.
   */
  it("one file names the switch column — its writer; everything else reads the SQL function", () => {
    expect(naming("delivery_model_v2_from")).toEqual(["admin/src/delivery/go-live.repository.ts"]);
    const writers = sources.filter((s) => /SET\s+delivery_model_v2_from/.test(s.src)).map((s) => s.file);
    expect(writers).toEqual(["admin/src/delivery/go-live.repository.ts"]);
  });

  it("⚠ 083 — 'ready' is defined once, and the page, the setter and the sweep all ask it", () => {
    const defined = sources.filter((s) => /function goLiveReadiness\b/.test(s.src)).map((s) => s.file);
    expect(defined).toEqual(["shared/src/delivery/readiness.ts"]);
    const service = sources.find((s) => s.file === "admin/src/delivery/go-live.service.ts")!.src;
    // Three uses: readGoLive (the page), setSwitch (the refusal), sweep (until the moment).
    expect(service.match(/goLiveReadiness\(/g)).toHaveLength(3);
    const callers = sources.filter((s) => /goLiveReadiness\(/.test(s.src)).map((s) => s.file).sort();
    expect(callers).toEqual(["admin/src/delivery/go-live.service.ts", "shared/src/delivery/readiness.ts"]);
  });

  /**
   * ⚠ 083 stage 2 — THERE IS ONE DELIVERY MODEL, AND NOTHING ASKS WHICH. The old arrangement was
   * removed; `public.delivery_model_v2_at` answers true for good and is called only from inside the
   * database (`courier_delivery_state`). A service that asked again would be bringing back a second
   * checkout to choose between.
   */
  it("no service asks the database which delivery model is on", () => {
    expect(naming("delivery_model_v2_at")).toEqual([]);
    expect(sources.filter((s) => /deliveryModelV2At/.test(s.src)).map((s) => s.file)).toEqual([]);
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
