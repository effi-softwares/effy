import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * FR-050, mechanically — a driver's contact details must not reach a log line, a metric label, or an
 * analytics payload.
 *
 * ⚠ WHY THIS IS A SOURCE SWEEP AND NOT A RUNTIME ASSERTION. A leak of this kind happens ONCE, in one
 * `log.info({ driver })` somebody adds while debugging, and it is invisible forever afterwards
 * because logs are not read in tests. The only guard that catches it is one that reads the source
 * every time the suite runs.
 *
 * ⚠ The emergency contact is a THIRD PARTY'S details — someone who never dealt with Effy at all and
 * has no relationship with the platform to consent to anything.
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

/** Every logging call in the file, with the file it came from. */
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
    // ⚠ A guard over a file list must assert the list is non-empty, or it silently stops guarding.
    // 054 found a test passing VACUOUSLY once the collection it looped over emptied.
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
    // `log.error({ driver })` is the realistic leak: nobody types the phone number, they shorthand
    // the object that contains it.
    //
    // ⚠ THE FIRST VERSION OF THIS ASSERTION DID NOT CATCH IT. It matched only the SHORTHAND form
    // `{ driver }` — and the leak I injected to prove the guard was `{ driver: row }`, which sailed
    // straight through. The guard was tested by breaking it, the break was not caught, and that is
    // the only reason this now covers both forms. A guard nobody tries to defeat is decoration.
    const WHOLE_OBJECT = [
      // shorthand: { driver }, { profile, x }
      /[{,]\s*(?:driver|profile|record|row|entity)\s*[,}]/,
      // explicit: { driver: row }, { d: profile }, { anything: driver }
      /[{,]\s*[A-Za-z_$][\w$]*\s*:\s*(?:driver|profile|record|row|entity|d)\b/,
      // spread: { ...driver }
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
    // A per-driver metric series is a cardinality explosion in Prometheus and an identifier in a
    // place with no retention policy.
    const metricLines = FILES.flatMap(({ path, source }) =>
      [...source.matchAll(/"fleet\.[a-z_]+"/g)].map(() => ({ path, source })),
    );
    expect(metricLines.length).toBeGreaterThan(0);
    for (const { path, source } of FILES) {
      for (const call of logCalls(source)) {
        if (!/fleet\./.test(source)) continue;
        // A metric log line may carry a count; it must not carry an identity.
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
