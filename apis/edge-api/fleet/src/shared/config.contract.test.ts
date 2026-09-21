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

  it("declares the DB and driver-pool env the service depends on", () => {
    for (const key of [
      "DB_HOST",
      "DB_PORT",
      "DB_NAME",
      "DB_USER",
      "DB_SECRET_ARN",
      "DRIVER_USER_POOL_ID",
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

  /**
   * ⚠ A NEGATIVE ASSERTION WHERE A POSITIVE ONE USED TO BE. This service held a read-only grant on
   * the `driver-proof/` prefix so the console could show a photo or signature; `proof_of_delivery`
   * went with the work model, so the grant now points at objects no row references. A standing
   * permission whose reason has been deleted is the kind nobody thinks to remove later, so its
   * absence is pinned rather than left to memory.
   */
  it("holds no S3 grant at all — proof media went with the work model", () => {
    expect(yaml).not.toContain("driver-proof");
    expect(yaml).not.toContain("s3:GetObject");
    expect(yaml).not.toContain("s3:PutObject");
    expect(yaml).not.toContain("S3_MEDIA_BUCKET");
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

/**
 * ⚠ 056'S FR-038 GUARD IS DELIBERATELY GONE, AND THIS COMMENT IS WHY.
 *
 * It asserted that no route could name a driver as a work destination — "assignment stays automatic;
 * no dispatcher, no accept/decline", which was 049's settled model and which 056 pinned over the
 * whole route table so nobody could reintroduce manual dispatch by review oversight.
 *
 * That model is what is being replaced. The sweep it protected assigned every ready package on the
 * platform to one driver and never once read `driver.delivery_zone_id`, so the guard was defending a
 * property of a mechanism that did not work. It is removed with the mechanism rather than left
 * standing, because a guard that outlives its rule fails the first honest attempt to build the
 * replacement and gets deleted in a hurry by whoever is mid-slice — the worst moment to be deciding
 * whether a rule still holds.
 *
 * The dispatch slice owns the question of whether an operator may target a named driver, and owns
 * writing whatever guard its answer deserves.
 */
