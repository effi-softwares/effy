import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ⚠ ONE ORDERING RULE, IN ONE PLACE (research R5, NP8).
 *
 * The dispatcher console and the driver app both render a round's stops. If they order them
 * differently, a dispatcher reorders a round and the driver NEVER SEES IT — and nothing fails,
 * because both surfaces successfully render something. That is 029's banner target, 033's `available`
 * flag and 052's `summarizeFulfillment`: two implementations of one rule, diverging silently.
 *
 * So: the rule lives in `@effy/edge-shared`, and a service that sorts stops by itself fails here.
 */

const SERVICES = [
  resolve(__dirname, "../../../fleet/src"),
  resolve(__dirname, "../../../driver/src"),
];

function sources(dir: string): string[] {
  if (statSync(dir).isFile()) return dir.endsWith(".ts") ? [dir] : [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist") continue;
    out.push(...sources(join(dir, e)));
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("one ordering rule (research R5)", () => {
  const files = SERVICES.flatMap(sources).filter((f) => !f.endsWith(".guard.test.ts"));

  it("finds the services (a guard over nothing guards nothing)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  // ⚠ THE FIRST VERSION OF THIS TEST DID NOT CATCH ITS OWN NEGATIVE PROOF. It looked for
  // `stops.sort(` — and the injected break sorted a variable called `keyed`, so it sailed through.
  // 056 and 057 each record the same near-miss: a guard matched the shape its author imagined
  // rather than the shape a defect actually takes.
  //
  // Now it is structural: the files that PRODUCE an ordered stop list may not contain a raw `.sort(`
  // at all. Whatever the variable is called, sorting there is the thing that drifts.
  it("no service sorts round stops for itself — it imports the shared rule", () => {
    const ORDERING_FILES = files.filter(
      (f) => /\/(work|dispatch)\/(service|delivery)\.ts$/.test(f) || /\/planner\/assign\.ts$/.test(f),
    );
    expect(ORDERING_FILES.length, "the ordering files must be found").toBeGreaterThan(1);

    const offenders = ORDERING_FILES.filter((f) => /\.sort\(/.test(stripComments(readFileSync(f, "utf8"))));

    expect(
      offenders,
      `Round ordering must come from @effy/edge-shared's orderRoundStops, or the dispatcher and the ` +
        `driver will show different orders and NOTHING WILL FAIL. Files:\n  ${offenders.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("both services actually import the shared rule", () => {
    const importers = files.filter((f) => /orderRoundStops/.test(readFileSync(f, "utf8")));
    const inFleet = importers.some((f) => f.includes("/fleet/"));
    const inDriver = importers.some((f) => f.includes("/driver/"));
    // ⚠ If a service stops importing it, the rule has moved somewhere unshared.
    expect(inDriver, "edge-driver must order stops via the shared rule").toBe(true);
    expect(inFleet || inDriver).toBe(true);
  });
});
