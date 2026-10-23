import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A shop is never told when the customer's delivery is: shown "Thursday", it would pick on Thursday
 * when the package must go to the hub now. No source here may read the promise columns.
 */

const ROOT = resolve(__dirname, "..");

const FORBIDDEN = [
  /\bwindow_start\b/,
  /\bwindow_end\b/,
  /\bslot_id\b/,
  /\bpromised_from\b/,
  /\bpromised_to\b/,
  /\bdelivery_slot\b/,
  /\bdelivery_slot_booking\b/,
  /\bdelivery_slot_load\b/,
  /\bdelivery_non_delivery_date\b/,
];

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (path.endsWith(".ts") && !path.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

/** Comments may name a column; only code may not read it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");
}

describe("the shop service never reads the customer's delivery promise (069)", () => {
  const files = sources(ROOT);

  it("finds the service (a guard over nothing guards nothing)", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no source file reads the delivery day, the window, or the slot tables", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const pattern of FORBIDDEN) {
        if (pattern.test(code)) offenders.push(`${file.slice(ROOT.length + 1)} reads ${pattern.source}`);
      }
    }
    expect(
      offenders,
      "A shop must not be shown the customer's delivery day or window. It picks to its own ready-by " +
        "(promise.ts); a standard package waits at the hub, not at the shop.",
    ).toEqual([]);
  });

  it("still reads its OWN ready-by — the guard must not have been satisfied by deleting the promise", () => {
    const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(all).toMatch(/DEFAULT_READY_WINDOW_MS/);
  });
});
