import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { FLEET_ENV_KEYS } from "./config";

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the fleet service (056).
 *
 * This is the SIXTH guard against one recurring defect (027 R13, 029, 033, 035, 039, 054): a unit
 * test that supplies its own configuration can never notice that the configuration does not exist.
 * 035 read four env vars its `serverless.yml` never declared — every pool resolved "unknown", NO
 * EMAIL WAS EVER SENT, and one hundred passing tests missed it, because the tests set those vars
 * themselves.
 *
 * So this test mocks nothing. It reads the ACTUAL serverless.yml.
 */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "..", "..");
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");

/** Every function declared in the file, with its block, so assertions can be exhaustive rather than
 *  applied to a hand-written list that drifts as routes are added. */
function allFunctions(): { name: string; block: string }[] {
  const fnSection = yaml.slice(yaml.indexOf("\nfunctions:"), yaml.indexOf("\nresources:"));
  const out: { name: string; block: string }[] = [];
  const re = /\n {2}([a-zA-Z][a-zA-Z0-9]*):\n/g;
  let m: RegExpExecArray | null;
  const starts: { name: string; at: number }[] = [];
  while ((m = re.exec(fnSection)) !== null) starts.push({ name: m[1]!, at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]!.at;
    const to = i + 1 < starts.length ? starts[i + 1]!.at : fnSection.length;
    out.push({ name: starts[i]!.name, block: fnSection.slice(from, to) });
  }
  return out;
}

describe("fleet deployment contract — serverless.yml declares what the service needs", () => {
  it("declares every env var src/shared/config.ts reads", () => {
    // Self-checking against the module's own exported key list, so adding a threshold to config.ts
    // without declaring it here fails rather than silently defaulting forever.
    for (const key of FLEET_ENV_KEYS) {
      expect(yaml, `${key} is read by config.ts but not declared in serverless.yml`).toContain(
        `${key}:`,
      );
    }
  });

  it("declares the DB, driver-pool and media env the service depends on", () => {
    for (const key of [
      "DB_HOST",
      "DB_PORT",
      "DB_NAME",
      "DB_USER",
      "DB_SECRET_ARN",
      "DRIVER_USER_POOL_ID",
      "S3_MEDIA_BUCKET",
    ]) {
      expect(yaml).toContain(`${key}:`);
    }
  });

  it("puts the BACK-OFFICE authorizer on every route except the two public health probes", () => {
    // ⚠ Exhaustive over the real file, not over a list. A new route added without an authorizer is
    // a driver-management endpoint open to the internet, and the whole point of this assertion is
    // that nobody has to remember to extend it.
    for (const { name, block } of allFunctions()) {
      if (name === "healthz" || name === "readyz") {
        expect(block, `${name} must stay public`).not.toContain("authorizer");
        continue;
      }
      expect(block, `${name} must be authenticated`).toContain("authorizer");
      expect(block, `${name} must use the BACK-OFFICE authorizer`).toContain(
        "edge/authorizer/back-office_id",
      );
    }
  });

  it("attaches to the shared HTTP API and creates no API, stage, CORS or authorizer of its own", () => {
    expect(yaml).toContain("id: ${ssm:/effy/${sls:stage}/edge/http_api_id}");
    expect(yaml).not.toContain("cors:");
    expect(yaml).not.toMatch(/^\s+authorizers:/m);
  });

  it("scopes the Cognito grant to the DRIVER pool ARN and grants no group actions", () => {
    // Principle IV: the driver pool defines no RBAC groups, so a group action here would be a
    // permission with nothing to act on — and a standing one nobody would think to remove.
    expect(yaml).toContain("auth/driver/user_pool_arn");
    expect(yaml).not.toContain("AdminAddUserToGroup");
    expect(yaml).not.toContain("AdminRemoveUserFromGroup");
    // No other pool is reachable from this service.
    expect(yaml).not.toContain("auth/shop/user_pool_arn");
    expect(yaml).not.toContain("auth/customer/user_pool_arn");
    expect(yaml).not.toContain("auth/back-office/user_pool_arn");
  });

  it("grants READ-ONLY access to proof media, under the driver-proof prefix only", () => {
    // ⚠ Narrower than edge-driver's grant on the same prefix, which also carries PutObject.
    // Back-office VIEWS proof; it never captures any, so it must not be able to write one.
    expect(yaml).toContain("driver-proof/*");
    expect(yaml).not.toContain("s3:PutObject");
    expect(yaml).not.toContain("s3:DeleteObject");
  });

  it("sets versionFunctions:false from the start, not after hitting the CFN ceiling", () => {
    // admin had to add this under pressure at 511 resources (049). A new stack pays nothing to set
    // it on day one and cannot be surprised later.
    expect(yaml).toContain("versionFunctions: false");
  });

  it("alarms on a half-provisioned driver and NOT on outstanding exception workload", () => {
    expect(yaml).toContain("fleet.driver_provision_failed");
    expect(yaml).toContain("DriverProvisionFailedAlarm");
    // Outstanding exceptions is a workload number. Alarming on workload teaches operators to ignore
    // alarms, and this alerts topic also carries "sending reputation is about to be suspended".
    expect(yaml).not.toContain("ExceptionOutstandingAlarm");
  });
});

describe("FR-038 — assignment stays automatic; no route can target a named driver", () => {
  it("declares no route that accepts a destination driver for a piece of work", () => {
    // ⚠ Asserted over the WHOLE route table rather than trusting review. 049 settled "no dispatcher,
    // no accept/decline"; the sanctioned intervention is RELEASING work back to the pool and letting
    // the sweep decide. A path segment that names a driver as a work destination would quietly
    // reintroduce manual dispatch.
    const paths = [...yaml.matchAll(/path: (\S+)/g)].map((m) => m[1]!);
    const assignmentShaped = paths.filter(
      (p) => /assign|dispatch|reassign/i.test(p) && /driver/i.test(p),
    );
    expect(assignmentShaped, `manual-dispatch-shaped routes: ${assignmentShaped.join(", ")}`).toEqual(
      [],
    );

    // The release route exists and is a release, not an assignment: it names no driver at all.
    const release = paths.find((p) => p.includes("/stranded/release"));
    expect(release).toBe("/fleet/v1/stranded/release");
    expect(release).not.toContain("driverId");
  });
});
