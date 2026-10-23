import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { FLEET_ENV_KEYS } from "./config";

/** Reads the real serverless.yml. */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "..", "..");
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");

/** Every function with its block, so assertions are exhaustive. */
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
    // Against the module's own exported key list.
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
    // Exhaustive over the real file: any function exposing a route must carry the back-office
    // authorizer. Keyed on whether it has a route, so a scheduled function is exempt structurally.
    for (const { name, block } of allFunctions()) {
      const exposesRoute = /httpApi:/.test(block);

      if (name === "healthz" || name === "readyz") {
        expect(block, `${name} must stay public`).not.toContain("authorizer");
        continue;
      }

      if (!exposesRoute) {
        // A scheduled function must not be reachable by anybody.
        expect(block, `${name} has no route, so it must declare a trigger`).toMatch(/schedule:|sqs:|sns:|eventBridge:/);
        expect(block, `${name} has no route and must not declare an authorizer`).not.toContain("authorizer");
        continue;
      }

      expect(block, `${name} must be authenticated`).toContain("authorizer");
      expect(block, `${name} must use the BACK-OFFICE authorizer`).toContain(
        "staff/authorizer/back-office_id",
      );
    }
  });

  // The dispatch routes must exist.
// The file must parse as YAML (CloudFormation tags accepted as opaque).
  it("is valid YAML that parses into functions (063)", async () => {
    const { parse } = await import("yaml");
    const doc = parse(yaml, { logLevel: "error" }) as { functions?: Record<string, unknown> };
    expect(doc, "serverless.yml did not parse").toBeTruthy();
    expect(
      Object.keys(doc.functions ?? {}).length,
      "no functions parsed — the document is valid YAML but not a serverless service",
    ).toBeGreaterThan(5);
  });

  it("declares every dispatch route the console calls (063)", () => {
    for (const path of [
      "/fleet/v1/dispatch/day",
      "/fleet/v1/dispatch/rounds/{id}",
      "/fleet/v1/dispatch/rounds/{id}/reassign",
      "/fleet/v1/dispatch/rounds/{id}/unassign",
      "/fleet/v1/dispatch/rounds/{id}/reorder",
      "/fleet/v1/dispatch/packages/{packageId}/drivers",
      "/fleet/v1/dispatch/packages/{packageId}/assign",
      "/fleet/v1/dispatch/packages/{packageId}/unassign",
    ]) {
      expect(yaml, `${path} is called by the console but not declared`).toContain(`path: ${path}`);
    }
  });

  it("declares the wave planner as a scheduled function, not a route (063)", () => {
    const planner = allFunctions().find((f) => f.name === "planWavesScheduled");
    expect(planner, "the wave planner must exist — nothing assigns work without it").toBeDefined();
    expect(planner!.block).toContain("schedule:");
    expect(planner!.block).not.toContain("httpApi:");
  });

  it("attaches to the STAFF HTTP API (075) and creates no API, stage, CORS or authorizer of its own", () => {
    expect(yaml).toContain("id: ${ssm:/effy/${sls:stage}/staff/http_api_id}");
    expect(yaml).not.toContain("cors:");
    expect(yaml).not.toMatch(/^\s+authorizers:/m);
  });

  it("scopes the Cognito grant to the DRIVER pool ARN and grants no group actions", () => {
    // The driver pool has no groups, so no group actions.
    expect(yaml).toContain("auth/driver/user_pool_arn");
    expect(yaml).not.toContain("AdminAddUserToGroup");
    expect(yaml).not.toContain("AdminRemoveUserFromGroup");
    expect(yaml).not.toContain("auth/shop/user_pool_arn");
    expect(yaml).not.toContain("auth/customer/user_pool_arn");
    expect(yaml).not.toContain("auth/back-office/user_pool_arn");
  });

  /** No grant on the old `driver-proof/` prefix. */
  it("holds no S3 grant at all — proof media went with the work model", () => {
    expect(yaml).not.toContain("driver-proof");
    expect(yaml).not.toContain("s3:GetObject");
    expect(yaml).not.toContain("s3:PutObject");
    expect(yaml).not.toContain("S3_MEDIA_BUCKET");
  });

  it("sets versionFunctions:false from the start, not after hitting the CFN ceiling", () => {
    expect(yaml).toContain("versionFunctions: false");
  });

  it("alarms on a half-provisioned driver and NOT on outstanding exception workload", () => {
    expect(yaml).toContain("fleet.driver_provision_failed");
    expect(yaml).toContain("DriverProvisionFailedAlarm");
    // No alarm on outstanding exceptions: workload alarms teach people to ignore alarms.
    expect(yaml).not.toContain("ExceptionOutstandingAlarm");
  });

  // AWS property limits (a Lambda Description is 256 characters), reported by CloudFormation only at deploy.
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

