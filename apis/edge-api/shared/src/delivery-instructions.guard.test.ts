import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Shops and emails never see a customer's delivery note (it may hold a gate code). It lives in its own
 * columns, and no source file of the shop or notifications services may select them.
 */

const EDGE_API = fileURLToPath(new URL("../..", import.meta.url));
const FORBIDDEN_FOR = ["shop", "notifications"] as const;
const BANNED = ["delivery_note", "delivery_handover", "deliveryInstructions"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("066 — delivery instructions stay out of shop and email code paths", () => {
  for (const service of FORBIDDEN_FOR) {
    it(`edge-api/${service} never references them`, () => {
      const files = sourceFiles(join(EDGE_API, service, "src"));
      // A guard that scans nothing passes forever.
      expect(files.length).toBeGreaterThan(10);

      const offenders = files
        .filter((f) => {
          const body = readFileSync(f, "utf8");
          return BANNED.some((b) => body.includes(b));
        })
        .map((f) => relative(EDGE_API, f));

      expect(offenders, `these files must not read a customer's delivery instructions`).toEqual([]);
    });
  }
});
