import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/** No location data: sequencing is ordering, not geometry, and distance must never become a tie-break. */

const ROOTS = [
  resolve(__dirname, ".."),
  resolve(__dirname, "../../../driver/src"),
  resolve(__dirname, "../../../shared/src/lib/round-ordering.ts"),
  resolve(__dirname, "../../../shared/src/lib/driver-eligibility.ts"),
];

const BANNED = [
  /\blatitude\b/i,
  /\blongitude\b/i,
  /\bgeocod/i,
  /\bhaversine\b/i,
  /\bpostgis\b/i,
  /\bst_distance\b/i,
  /\bst_dwithin\b/i,
  /\bdistance_km\b/i,
  /\btravel_time\b/i,
  /\bnearest[_ ]driver\b/i,
];

function sources(path: string): string[] {
  if (statSync(path).isFile()) return path.endsWith(".ts") ? [path] : [];
  const out: string[] = [];
  for (const entry of readdirSync(path)) {
    if (entry === "node_modules" || entry === "dist") continue;
    out.push(...sources(join(path, entry)));
  }
  return out;
}

/** Comments stripped, so prose cannot trip the rule. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** The one exception: `run-map.ts`, a display read; the second test fails if anything that plans work imports it. */
const RUN_MAP = resolve(__dirname, "../../../driver/src/work/run-map.ts");
// Its test-only seed.
const RUN_MAP_FIXTURE = resolve(__dirname, "../../../driver/src/work/run-map.fixture.ts");

describe("no location data (SC-012)", () => {
  const files = ROOTS.flatMap(sources).filter((f) => !f.endsWith(".guard.test.ts") && f !== RUN_MAP && f !== RUN_MAP_FIXTURE);

  it("the run map exists, and only display reads import it (D25)", () => {
    expect(statSync(RUN_MAP).isFile()).toBe(true);
    const importers = files.filter((f) => /from "\.\/run-map"|run-map"/.test(readFileSync(f, "utf8")));
    for (const f of importers) {
      expect(f, "only the driver's read services may use the run map").toMatch(/driver\/src\/work\/(service|delivery)\.ts$/);
    }
    for (const f of files.filter((f) => /run-map\.fixture"/.test(readFileSync(f, "utf8")))) {
      expect(f, "the run map's seed is for tests only").toMatch(/\.test\.ts$/);
    }
  });

  it("reads a meaningful number of files (a guard over nothing guards nothing)", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(BANNED.map((re) => [re.source, re] as const))(
    "no source in this slice mentions %s",
    (_label, re) => {
      const hits = files.filter((f) => re.test(stripComments(readFileSync(f, "utf8"))));
      expect(
        hits,
        `Location data was cut from this slice deliberately (D20/D22). If distance is genuinely ` +
        `needed, that is a spec change and a research decision to reopen - not a tie-break to add ` +
        `quietly. Files:\n  ${hits.join("\n  ")}\n`,
      ).toEqual([]);
    },
  );
});
