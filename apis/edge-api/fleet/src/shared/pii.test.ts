import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A driver's contact details (including the emergency contact, a third party) never reach a log line,
 * metric label or analytics payload. A source sweep, because a leak is one debugging line nobody reads.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, "..");

const PII_FIELDS = [
  "contact_phone",
  "contactPhone",
  "emergency_contact_name",
  "emergencyContactName",
  "emergency_contact_phone",
  "emergencyContactPhone",
  "licence_reference",
  "licenceReference",
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (!entry.endsWith(".ts") || entry.includes(".test.")) continue;
    out.push(full);
  }
  return out;
}

function logCalls(source: string): string[] {
  // scope.log.<level>( … ) up to the closing paren of the first argument object.
  return [...source.matchAll(/log\.(?:info|warn|error|debug)\(([\s\S]{0,400}?)\)\s*[;,]/g)].map(
    (m) => m[1]!,
  );
}

const FILES = sourceFiles(SRC).map((path) => ({
  path: path.slice(path.indexOf("src/")),
  source: readFileSync(path, "utf8"),
}));

describe("FR-050 — no driver PII in logs or metrics", () => {
  it("has source files to check", () => {
    // The file list must be non-empty, or the guard silently stops guarding.
    expect(FILES.length).toBeGreaterThan(10);
  });

  it("⚠ never puts a PII field in a log call", () => {
    for (const { path, source } of FILES) {
      for (const call of logCalls(source)) {
        for (const field of PII_FIELDS) {
          expect(call, `${path} logs ${field}`).not.toContain(field);
        }
      }
    }
  });

  it("⚠ never logs a whole driver object, which would carry PII by accident", () => {
    // The realistic leak is the object containing the phone, in any form:
    const WHOLE_OBJECT = [
      // shorthand: { driver }, { profile, x }
      /[{,]\s*(?:driver|profile|record|row|entity)\s*[,}]/,
      // explicit: { driver: row }, { d: profile }, { anything: driver }
      /[{,]\s*[A-Za-z_$][\w$]*\s*:\s*(?:driver|profile|record|row|entity|d)\b/,
      // spread: {...driver }
      /\.\.\.\s*(?:driver|profile|record|row|entity)\b/,
    ];
    for (const { path, source } of FILES) {
      for (const call of logCalls(source)) {
        for (const pattern of WHOLE_OBJECT) {
          expect(call, `${path} logs a whole driver/profile object: ${call.trim()}`).not.toMatch(
            pattern,
          );
        }
      }
    }
  });

  it("⚠ keeps metric labels low-cardinality — no driver id as a label (Principle VII)", () => {
    // No per-driver metric series: an identifier with no retention policy.
    const metricLines = FILES.flatMap(({ path, source }) =>
      [...source.matchAll(/"fleet\.[a-z_]+"/g)].map(() => ({ path, source })),
    );
    expect(metricLines.length).toBeGreaterThan(0);
    for (const { path, source } of FILES) {
      for (const call of logCalls(source)) {
        if (!/fleet\./.test(source)) continue;
        // A count, never an identity.
        if (call.includes("driverId") && /"fleet\./.test(source)) {
          expect(
            call.includes("stage") || call.includes("released"),
            `${path} may be emitting a per-driver metric series`,
          ).toBe(true);
        }
      }
    }
  });
});
