import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⚠ Deployment contract for the driver-management routes (049). Reads the ACTUAL serverless.yml —
 * a unit test that supplies its own config can never notice the config is absent (027 R13 lineage).
 */
const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");

function functionBlock(fn: string): string {
  const start = yaml.indexOf(`  ${fn}:`);
  expect(start, `${fn} is not declared`).toBeGreaterThan(-1);
  const rest = yaml.slice(start + fn.length);
  const end = rest.search(/\n {2}[a-zA-Z]/);
  return end < 0 ? rest : rest.slice(0, end);
}

describe("driver-management deployment contract", () => {
  it("carries the BACK-OFFICE authorizer on every driver route", () => {
    for (const fn of ["driversListV1", "driverGetV1", "driverCreateV1", "driverUpdateV1", "driverStatusV1"]) {
      expect(functionBlock(fn)).toContain("/edge/authorizer/back-office_id");
    }
  });

  it("declares the driver pool id and scopes Cognito IAM to the driver pool ARN", () => {
    expect(yaml).toContain("DRIVER_USER_POOL_ID:");
    expect(yaml).toContain("/effy/${sls:stage}/auth/driver/user_pool_arn");
  });

  it("registers the five driver routes at the expected paths", () => {
    expect(yaml).toContain("path: /admin/v1/drivers");
    expect(yaml).toContain("path: /admin/v1/drivers/{driverId}");
    expect(yaml).toContain("path: /admin/v1/drivers/{driverId}/status");
  });
});
