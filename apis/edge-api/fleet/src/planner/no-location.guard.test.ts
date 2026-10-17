import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ⚠ NO LOCATION DATA, ANYWHERE IN THIS SLICE (SC-012, operator direction D20/D22).
 *
 * Sequencing here is an ORDERING problem, not a geometry one. The whole geodata strand — G-NAF,
 * geocoding, distance matrices, nearest-neighbour, PostGIS, H3, VROOM — was researched properly and
 * then CUT, which is why we know what was given up rather than merely that it was skipped.
 *
 * ⚠ THE RISK IS NOT SOMEBODY ADDING A MAP. It is somebody quietly reintroducing distance as a
 * tie-break, because the research's ORIGINAL tie-break was proximity and every instinct says
 * "nearest driver". FR-014b forbids it and this makes the forbidding mechanical.
 */

const ROOTS = [
  resolve(__dirname, ".."), // apis/edge-api/fleet/src
  resolve(__dirname, "../../../driver/src"),
  resolve(__dirname, "../../../shared/src/lib/round-ordering.ts"),
  resolve(__dirname, "../../../shared/src/lib/driver-eligibility.ts"),
];

/** Words that would mean a coordinate or a distance had come back. */
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

/** ⚠ Comments are stripped: a rule explained in prose must not trip the rule it explains. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * ⚠ D25 (092 rev 2, operator direction 2026-10-17) — THE ONE EXCEPTION: the driver app's decorative run
 * map. `run-map.ts` reads the postcode place points the platform already holds, to draw a schematic; it
 * is a DISPLAY read, and the second test below fails if anything that plans, orders or assigns work
 * imports it. Every other file stays under the rule.
 */
const RUN_MAP = resolve(__dirname, "../../../driver/src/work/run-map.ts");
// Its test-only seed for the same two points (D25) — imported by tests only.
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
          `needed, that is a spec change and a research decision to reopen — not a tie-break to add ` +
          `quietly. Files:\n  ${hits.join("\n  ")}\n`,
      ).toEqual([]);
    },
  );
});
