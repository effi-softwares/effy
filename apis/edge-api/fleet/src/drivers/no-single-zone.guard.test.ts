import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** A driver has no single zone: coverage is `driver_zone_capability`. Reads the source, not the schema. */

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

/** Comments name the column; naming is not using. */
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
    // A guard that scans nothing passes forever.
    const scanned = [...sourceFiles(fleetSrc), ...sourceFiles(consoleDrivers)];
    expect(scanned.length, "the source list resolved to nothing").toBeGreaterThan(20);
  });
});
