import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Reads the real serverless.yml: every authenticated /driver/v1/* route carries the driver authorizer,
 * and every env key the code reads is declared.
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

  it("declares the environment keys the service reads", () => {
    for (const key of [
      "DB_HOST",
      "DB_PORT",
      "DB_NAME",
      "DB_USER",
      "DB_SECRET_ARN",
      // The shared media helper reads this to presign proof uploads.
      "S3_MEDIA_BUCKET",
    ]) {
      expect(yaml.includes(`${key}:`), `serverless.yml does not declare ${key}`).toBe(true);
    }
  });

  /** Without this grant every proof capture fails at the presign. */
  it("grants S3 object access for proof media, scoped to objects and not the bucket", () => {
    expect(yaml).toMatch(/s3:PutObject/);
    expect(yaml).toMatch(/s3:GetObject/);
    // Objects only: a bucket grant would let a driver credential list the shared bucket.
    expect(yaml).toMatch(/arn:aws:s3:::effy-\$\{sls:stage\}-product-media\/\*/);
    expect(yaml).not.toMatch(/s3:ListBucket/);
  });

  /**
   * Effy does not track driver position: no location route. If it is ever wanted, consent, notice and a
   * retention rule land in the same change.
   */
  it("exposes no route that accepts a driver location, and stores none", () => {
    expect(yaml).not.toMatch(/path: .*location/i);
    expect(yaml).not.toContain("driverLocationV1");
  });

  /** Nothing in this service runs on a timer. */
  it("schedules nothing — the 049 assignment sweep is retired, not disabled", () => {
    expect(yaml).not.toContain("schedule:");
    expect(yaml).not.toContain("assignmentSchedule");
  });

  // The file must parse as YAML (CloudFormation tags accepted as opaque); the regex checks cannot see that.
  it("is valid YAML that parses into functions (063)", async () => {
    const { parse } = await import("yaml");
    const doc = parse(yaml, { logLevel: "error" }) as { functions?: Record<string, unknown> };
    expect(doc, "serverless.yml did not parse").toBeTruthy();
    expect(
      Object.keys(doc.functions ?? {}).length,
      "no functions parsed — the document is valid YAML but not a serverless service",
    ).toBeGreaterThan(5);
  });

  // AWS property limits (a Lambda Description is 256 characters), which CloudFormation reports only at deploy.
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
