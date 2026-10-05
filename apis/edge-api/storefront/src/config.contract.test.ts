import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the storefront service — 035's guard.
 *
 * 035's fourth defect: code read four env vars `serverless.yml` never declared, every lookup
 * resolved "unknown", and a hundred passing tests missed it because the tests set those vars
 * themselves. A unit test that provides its own environment cannot catch an environment that is not
 * provisioned — so this reads the ACTUAL `serverless.yml`.
 *
 * It also pins the two things that DEFINE this service: no route takes a credential, and it
 * connects as the connection-limited shopper role rather than the master user (070 research R4).
 */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "..");
const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");

function declaredEnvKeys(): Set<string> {
  const start = yaml.indexOf("\n  environment:\n");
  if (start < 0) throw new Error("serverless.yml has no provider.environment block");
  const rest = yaml.slice(start + "\n  environment:\n".length);
  const end = rest.search(/\n {2}[a-z]/);
  const keys = new Set<string>();
  for (const line of (end < 0 ? rest : rest.slice(0, end)).split("\n")) {
    const m = /^ {4}([A-Z][A-Z0-9_]*):/.exec(line);
    if (m?.[1]) keys.add(m[1]);
  }
  return keys;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return p.endsWith(".ts") && !p.endsWith(".test.ts") ? [p] : [];
  });
}

/** Set by the Lambda runtime itself, never by `serverless.yml`. */
const RUNTIME_PROVIDED = new Set(["AWS_LAMBDA_FUNCTION_NAME", "AWS_SESSION_TOKEN", "AWS_REGION"]);

describe("storefront service deployment contract", () => {
  const declared = declaredEnvKeys();

  it("declares every key the shared library reads on this service's behalf", () => {
    const required = [
      "DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_SECRET_ARN", // db
      "S3_MEDIA_BUCKET", // presigned image reads
      "METRIC_NAMESPACE", // emitMetric
      "EFFY_ENV", "LOG_LEVEL", // logger
    ];
    expect(required.filter((k) => !declared.has(k))).toEqual([]);
  });

  it("declares every environment variable its own source reads", () => {
    const read = new Set<string>();
    for (const file of sourceFiles(here)) {
      for (const m of readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) read.add(m[1]!);
    }
    const missing = [...read].filter((k) => !declared.has(k) && !RUNTIME_PROVIDED.has(k));
    expect(missing, `read in src but not declared in serverless.yml: ${missing.join(", ")}`).toEqual([]);
  });

  it("connects as the SHOPPER role, never the master user", () => {
    expect(yaml).toMatch(/DB_USER: \$\{ssm:\/effy\/\$\{sls:stage\}\/db\/shopper_username\}/);
    expect(yaml).toMatch(/DB_SECRET_ARN: \$\{ssm:\/effy\/\$\{sls:stage\}\/db\/shopper_secret_arn\}/);
    expect(yaml).not.toContain("master_username");
    expect(yaml).not.toContain("master_secret_arn");
  });

  it("takes no credential on any route — that is what makes it the storefront", () => {
    expect(yaml).not.toMatch(/^\s+authorizer:/m);
  });

  it("can read product images and cannot write them", () => {
    expect(yaml).toContain("s3:GetObject");
    expect(yaml).not.toContain("s3:PutObject");
    expect(yaml).not.toContain("s3:DeleteObject");
  });

  it("holds no payment secret", () => {
    expect(yaml).not.toMatch(/stripe/i);
  });

  it("attaches to the shared HTTP API rather than creating one", () => {
    expect(yaml).toMatch(/httpApi:\s*\n\s+id: \$\{ssm:\/effy\/\$\{sls:stage\}\/edge\/http_api_id\}/);
  });

  it("serves every route under /storefront/", () => {
    const paths = [...yaml.matchAll(/^\s+path: (\S+)$/gm)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.filter((p) => !p.startsWith("/storefront/"))).toEqual([]);
  });

  it("disables function versioning from the first deploy", () => {
    expect(yaml).toMatch(/^ {2}versionFunctions: false$/m);
  });
});
