import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ⚠ THE GUARD WHOSE ABSENCE LET SIXTEEN ROUTES GO DEAD (063).
 *
 * The driver app calls its backend by string literal. When the work model was torn down, the routes
 * went with it and **the app's client code stayed exactly as it was** — five HTTP repositories, all
 * wired into ViewModels, all calling paths that now 404. Nothing failed: not `tsc`, not the Kotlin
 * compile, not a single test on either side. It was found by reading the app, months of work later.
 *
 * This test makes that impossible to repeat. It reads the ROUTES THE APP ACTUALLY CALLS out of the
 * Kotlin source and fails naming any that `serverless.yml` does not declare.
 *
 * ⚠ DEFERRED ROUTES ARE LISTED EXPLICITLY, NOT PATTERN-MATCHED. A route Slice D will build is a
 * decision somebody made; a route that merely looks unfinished is a bug. Listing them by hand means
 * removing one from this array is the act that makes the guard demand it.
 */

const APP_SRC = resolve(__dirname, "../../../../../apps/driver-mobile/shared/src/commonMain");
const SERVERLESS = resolve(__dirname, "../../serverless.yml");

/** Slice D — the three custody mechanisms (D16). Each must be built, or deliberately un-listed here. */
// ⚠ EMPTY, AND THAT IS THE POINT. 064 built all three routes this list held — `.../proof`,
// `.../proof/presign` and `.../fail` — and each entry was deleted as its route landed. The second
// test below is what forced that: a deferred route the app no longer calls fails the suite, so the
// list cannot rot into a place where entries are added and never removed.
//
// It stays declared (rather than being deleted with its last entry) because the NEXT deferral should
// be recorded here with its reason, not invented somewhere else.
const DEFERRED_TO_SLICE_D: string[] = [];

function kotlinFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...kotlinFiles(full));
    else if (entry.endsWith(".kt")) out.push(full);
  }
  return out;
}

/** Normalise `.../runs/$runId/stops/$stopId` and `.../{runId}` to one comparable shape. */
function normalise(path: string): string {
  return path
    .replace(/\$\{[^}]*\}/g, "{}")
    .replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, "{}")
    .replace(/\{[^}]*\}/g, "{}")
    .replace(/…/g, "{}")
    .replace(/^\/+|\/+$/g, "");
}

function routesTheAppCalls(): string[] {
  const found = new Set<string>();
  for (const file of kotlinFiles(APP_SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/"(driver\/v1\/[^"]*)"/g)) {
      found.add(normalise(m[1]!));
    }
  }
  return [...found].sort();
}

function routesTheServiceDeclares(): string[] {
  const yaml = readFileSync(SERVERLESS, "utf8");
  return [...yaml.matchAll(/path:\s*(\/driver\/[^\s]*)/g)].map((m) => normalise(m[1]!)).sort();
}

describe("route inventory — every route the app calls must exist", () => {
  it("finds the driver app's source (the guard is worthless if it silently reads nothing)", () => {
    const routes = routesTheAppCalls();
    expect(routes.length, "no driver/v1 routes found in the app — has it moved?").toBeGreaterThan(5);
  });

  it("declares every route the driver app calls, except those deferred to Slice D", () => {
    const called = routesTheAppCalls();
    const declared = new Set(routesTheServiceDeclares());
    const deferred = new Set(DEFERRED_TO_SLICE_D.map(normalise));

    const missing = called.filter((r) => !declared.has(r) && !deferred.has(r));

    expect(
      missing,
      `The driver app calls ${missing.length} route(s) this service does not declare. Every one of ` +
        `them returns 404 to a screen a driver is looking at, and NOTHING ELSE FAILS — not tsc, not ` +
        `the Kotlin compile, not any other test. Either build them or add them to ` +
        `DEFERRED_TO_SLICE_D with a reason.\n\n  ${missing.join("\n  ")}\n`,
    ).toEqual([]);
  });

  it("keeps the deferral list honest — a deferred route must still be one the app calls", () => {
    // ⚠ Otherwise the list rots into a place where entries are added and never removed, and the
    // guard quietly stops guarding the thing it was written for.
    const called = new Set(routesTheAppCalls());
    for (const d of DEFERRED_TO_SLICE_D.map(normalise)) {
      expect(called.has(d), `${d} is deferred but the app no longer calls it — delete the entry`).toBe(true);
    }
  });
});
