import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the driver service (049).
 *
 * The same defect this platform has guarded five times (027 R13, 029, 033, 035, 039): a unit test
 * that supplies its own configuration can never notice the configuration does not exist. So this test
 * mocks nothing — it reads the ACTUAL `serverless.yml` and asserts the wiring the service depends on.
 *
 * Two properties are load-bearing and invisible to a normal unit test:
 *  1. Every authenticated /driver/v1/* route must carry the DRIVER JWT authorizer. A missing
 *     authorizer would silently make a driver-only route public (auth isolation, Principle IV).
 *  2. The DB env keys the code reads must be declared, or every request fails at first use.
 *
 * ⚠ THE WORK-MODEL ROUTES ARE GONE, DELIBERATELY. Collection, hub check-in, delivery, proof, history
 * and the activity feed were retired with 049's assignment sweep (see
 * db/migrations/20260920101500_remove_driver_work_model.sql). What is left is the driver's IDENTITY
 * half — who they are, whether they are on duty, where they were, and where to push to. Asserting
 * over a list that no longer includes them is the point: a route that returns here must be added to
 * this list, rather than inheriting the previous slice's authorizer by resemblance.
 */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "..");
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");

function functionBlock(fn: string): string {
  const start = yaml.indexOf(`  ${fn}:`);
  expect(start, `${fn} is not declared in serverless.yml`).toBeGreaterThan(-1);
  const rest = yaml.slice(start + fn.length);
  const end = rest.search(/\n {2}[a-zA-Z]/);
  return end < 0 ? rest : rest.slice(0, end);
}

describe("driver deployment contract — serverless.yml declares what the service needs", () => {
  it("carries the DRIVER authorizer on the core authenticated /driver/v1 routes", () => {
    for (const fn of [
      "driverMeV1", "driverDutyV1",
      "driverDevicesV1Post", "driverDevicesV1IdDelete",
    ]) {
      const block = functionBlock(fn);
      expect(block, `${fn} must be authenticated`).toContain("authorizer");
      expect(block, `${fn} must use the DRIVER authorizer`).toContain("/edge/authorizer/driver_id");
    }
  });

  it("keeps the health probes PUBLIC (no authorizer)", () => {
    for (const fn of ["healthz", "readyz"]) {
      expect(functionBlock(fn), `${fn} must stay public`).not.toContain("authorizer");
    }
  });

  it("declares the DB environment keys the service reads", () => {
    for (const key of [
      "DB_HOST",
      "DB_PORT",
      "DB_NAME",
      "DB_USER",
      "DB_SECRET_ARN",
    ]) {
      expect(yaml.includes(`${key}:`), `serverless.yml does not declare ${key}`).toBe(true);
    }
  });

  /**
   * ⚠ EFFY DOES NOT TRACK DRIVER POSITION, AND THIS IS WHAT KEEPS IT THAT WAY (061, FR-035/FR-036).
   *
   * `POST /driver/v1/location` existed and was a RECEIVER WITH NO SENDER: no caller in
   * `apps/driver-mobile`, no location permission declared on Android or iOS, no reader of the three
   * `driver_duty_session.last_location_*` columns. Nothing was ever collected — and that is exactly
   * what made it dangerous. The moment anyone added a location permission to make a map work, the
   * platform would have begun recording an employee's position with no notice, no consent record and
   * no retention rule, and NOTHING WOULD HAVE FAILED.
   *
   * A removal without a guard is an invitation to restore it by resemblance, so the absence is
   * pinned rather than trusted to memory. If driver position is ever wanted, consent, notice and a
   * retention rule land in the SAME change — see decisions D10/D20/D22.
   */
  it("exposes no route that accepts a driver location, and stores none", () => {
    expect(yaml).not.toMatch(/path: .*location/i);
    expect(yaml).not.toContain("driverLocationV1");
  });

  /**
   * ⚠ A NEGATIVE ASSERTION, AND IT IS THE POINT OF THIS CHANGE. The greedy sweep is not paused or
   * feature-flagged, it is gone — and a schedule is exactly the kind of thing that gets restored by
   * someone reading the git history and assuming its absence was an oversight. Nothing in this
   * service may run on a timer until the dispatch slice says what the timer is for.
   */
  it("schedules nothing — the 049 assignment sweep is retired, not disabled", () => {
    expect(yaml).not.toContain("schedule:");
    expect(yaml).not.toContain("assignmentSchedule");
  });

  // ⚠ THE FILE MUST ACTUALLY PARSE, AND NOTHING ELSE HERE CHECKS THAT.
  //
  // Every other assertion in this file reads `serverless.yml` as TEXT and matches it with regexes —
  // which is fine for "does it declare X", and blind to whether the document is valid YAML at all.
  // 063 shipped a description containing `: ` unquoted, which YAML reads as a mapping key: every
  // test in this suite passed, `tsc` passed, and the failure appeared at DEPLOY, in front of the
  // operator, as "bad indentation of a mapping entry".
  //
  // ⚠ CloudFormation tags (`!Ref`, `!GetAtt`) are not known to a plain YAML loader, so they are
  // accepted as opaque rather than treated as errors — the point is the document's SHAPE.
  it("is valid YAML that parses into functions (063)", async () => {
    const { parse } = await import("yaml");
    const doc = parse(yaml, { logLevel: "error" }) as { functions?: Record<string, unknown> };
    expect(doc, "serverless.yml did not parse").toBeTruthy();
    expect(
      Object.keys(doc.functions ?? {}).length,
      "no functions parsed — the document is valid YAML but not a serverless service",
    ).toBeGreaterThan(5);
  });


  // ⚠ AWS PROPERTY LIMITS, CHECKED HERE BECAUSE CLOUDFORMATION CHECKS THEM LAST.
  //
  // 063 shipped a 328-character function description. Lambda caps `Description` at 256, so the
  // deploy died at `AWS::EarlyValidation::PropertyValidation` — an error that names NO property, NO
  // function and NO limit, and arrives only after two minutes of uploading artifacts.
  //
  // Every assertion above this one reads the file as text, and the YAML-parse test proves only that
  // the document is well-formed. Neither can see a value that is valid YAML, valid TypeScript, and
  // too long for the service it describes.
  it("keeps every function property inside its AWS limit (063)", async () => {
    const { parse } = await import("yaml");
    const doc = parse(yaml, { logLevel: "error" }) as {
      service?: string;
      functions?: Record<string, { description?: unknown; timeout?: unknown }>;
    };

    const service = typeof doc.service === "string" ? doc.service : "";
    for (const [name, fn] of Object.entries(doc.functions ?? {})) {
      if (typeof fn.description === "string") {
        expect(
          fn.description.length,
          `${name}: Lambda Description is capped at 256 characters — this is ${fn.description.length}. ` +
            `Put the reasoning in a YAML comment above it instead; CloudFormation will refuse the ` +
            `stack without telling you which property is wrong.`,
        ).toBeLessThanOrEqual(256);
      }
      const fullName = `${service}-dev-${name}`;
      expect(
        fullName.length,
        `${name}: the deployed function name "${fullName}" is ${fullName.length} characters; Lambda ` +
          `caps FunctionName at 64.`,
      ).toBeLessThanOrEqual(64);
      if (fn.timeout !== undefined) {
        expect(Number(fn.timeout), `${name}: Lambda timeout must be 1-900 seconds`).toBeGreaterThan(0);
        expect(Number(fn.timeout), `${name}: Lambda timeout must be 1-900 seconds`).toBeLessThanOrEqual(900);
      }
    }
  });

});
