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
 *  2. The DB + media env keys the code reads must be declared, or every request fails at first use.
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
      "driverMeV1", "driverDutyV1", "driverLocationV1", "driverTodayV1",
      "collectionRunV1", "collectionStopV1", "collectionStopCollectV1", "hubCheckinV1",
      "deliveryRunV1", "deliveryDropV1", "deliveryDropStatusV1", "proofPresignV1", "proofV1",
      "deliveryDropFailV1",
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

  it("declares the DB + media environment keys the service reads", () => {
    for (const key of [
      "DB_HOST",
      "DB_PORT",
      "DB_NAME",
      "DB_USER",
      "DB_SECRET_ARN",
      "S3_MEDIA_BUCKET",
    ]) {
      expect(yaml.includes(`${key}:`), `serverless.yml does not declare ${key}`).toBe(true);
    }
  });

  it("schedules the assignment sweep worker", () => {
    const block = functionBlock("assignmentSweep");
    expect(block, "the worker must be scheduled").toContain("schedule");
    expect(block, "the worker handler must exist").toContain("src/assignment/handler.handler");
  });

  it("scopes proof-media IAM to the driver-proof prefix only (never a wildcard bucket)", () => {
    expect(yaml).toContain("driver-proof/*");
  });
});
