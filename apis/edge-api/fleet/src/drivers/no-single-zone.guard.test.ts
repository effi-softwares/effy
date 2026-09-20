import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ⚠ A DRIVER HAS NO SINGLE ZONE ANY MORE, AND THIS IS WHAT KEEPS IT THAT WAY (062, FR-024/SC-009).
 *
 * `public.driver.delivery_zone_id` could hold ONE zone when a real driver plainly covers several —
 * and no assignment code ever read it. 049 declared that a driver without a zone "is inert for
 * assignment" and then never consulted the field in any decision. It was replaced by
 * `driver_zone_capability`, where coverage is a set of grants along three dimensions.
 *
 * ⚠ THE RISK IS RESEMBLANCE, NOT MALICE. `zoneId` is an ordinary-looking field on an
 * ordinary-looking entity, and the delivery service legitimately uses that exact name for real
 * zones. Somebody adding "which zone is this driver in?" would be writing a sensible-looking line of
 * code, and the result would be a SECOND answer to a question that now has one — the defect pattern
 * this whole programme exists to clean up.
 *
 * ⚠ READS THE SOURCE, NOT THE RUNNING SCHEMA. A guard against a live database passes right up until
 * somebody deploys.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fleetSrc = resolve(here, "..");
const consoleDrivers = resolve(
  here, "..", "..", "..", "..", "..", "apps", "back-office", "src", "features", "drivers",
);

function sourceFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(e) && !/\.(test|guard\.test)\.tsx?$/.test(e) ? [full] : [];
  });
}

/** Strip comments — the column is NAMED in several explanatory notes, and naming it is not using it. */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/--[^\n]*/g, "");
}

describe("FR-024 — a driver has no single zone", () => {
  it("⚠ no fleet or driver-console source reads driver.delivery_zone_id", () => {
    const offenders: string[] = [];

    for (const dir of [fleetSrc, consoleDrivers]) {
      for (const file of sourceFiles(dir)) {
        const src = withoutComments(readFileSync(file, "utf8"));
        if (/\bdelivery_zone_id\b/.test(src)) {
          offenders.push(`${file.split("/effy/")[1]} reads delivery_zone_id`);
        }
      }
    }

    expect(
      offenders,
      `a driver's coverage is a set of clearances now:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("⚠ the guard is reading real files, so a pass means something", () => {
    // 033 shipped a test that passed VACUOUSLY once the list it checked emptied.
    const scanned = [...sourceFiles(fleetSrc), ...sourceFiles(consoleDrivers)];
    expect(scanned.length, "the source list resolved to nothing").toBeGreaterThan(20);
  });
});
