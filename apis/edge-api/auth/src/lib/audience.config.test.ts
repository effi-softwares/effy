import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ⚠ THE DEPLOYMENT CONTRACT — the test that would have caught the first deploy's failure.
 *
 * WHAT HAPPENED. `audience.ts` resolves `event.userPoolId` through four environment variables.
 * `serverless.yml` declared NONE of them. Every pool therefore resolved to "unknown", the trigger
 * failed closed, no email was ever sent, and the only signal was an `otp_unknown_pool` metric.
 * Sign-in was impossible on all four audiences.
 *
 * ⚠ WHY EVERY OTHER TEST PASSED. They set the variables themselves:
 *
 *     process.env.CUSTOMER_USER_POOL_ID = POOL
 *
 * That is the fixture supplying what the DEPLOYMENT does not — the same failure this codebase has
 * now recorded three times (027 R13's Kotlin/Go quantity mismatch, 029's banner contract test that
 * pinned a payload no banner emitted, 033's key-set test written from the struct instead of the
 * contract). A unit test that mocks its own configuration can never notice that the configuration
 * does not exist.
 *
 * So this test does not mock anything. It reads the ACTUAL `serverless.yml` and the ACTUAL source,
 * and asserts they agree.
 */

const here = dirname(fileURLToPath(import.meta.url));
const serviceRoot = resolve(here, "../..");

function readServerlessEnvKeys(): Set<string> {
  const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");

  // Take the `environment:` block under `provider:` — from the key to the next sibling at the same
  // indentation (`iam:`, `layers:`, …). Deliberately crude: a YAML parser would be a dependency,
  // and the shape here is fixed and reviewed.
  const start = yaml.indexOf("\n  environment:\n");
  if (start < 0) throw new Error("serverless.yml has no provider.environment block");
  const rest = yaml.slice(start + "\n  environment:\n".length);
  const end = rest.search(/\n {2}[a-z]/);
  const block = end < 0 ? rest : rest.slice(0, end);

  const keys = new Set<string>();
  for (const line of block.split("\n")) {
    const m = /^ {4}([A-Z][A-Z0-9_]*):/.exec(line);
    if (m?.[1]) keys.add(m[1]);
  }
  return keys;
}

function readEnvKeysUsedBy(relativePath: string): Set<string> {
  const src = readFileSync(resolve(serviceRoot, relativePath), "utf8");
  const keys = new Set<string>();
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    if (m[1]) keys.add(m[1]);
  }
  return keys;
}

describe("deployment configuration", () => {
  it("⚠ declares EVERY environment variable the audience map reads", () => {
    // The specific gap that broke the first deploy.
    const declared = readServerlessEnvKeys();
    const used = readEnvKeysUsedBy("src/lib/audience.ts");

    expect(used.size).toBeGreaterThan(0); // guard: a refactor must not make this test vacuous
    const missing = [...used].filter((k) => !declared.has(k));
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("declares every environment variable the whole service reads", () => {
    // The general form. AWS_SESSION_TOKEN is supplied by the Lambda runtime, not by us.
    const runtimeProvided = new Set(["AWS_SESSION_TOKEN", "AWS_REGION", "NODE_ENV"]);
    const declared = readServerlessEnvKeys();

    const used = new Set<string>();
    for (const f of [
      "src/lib/audience.ts",
      "src/lib/secret.ts",
      "src/otp/mailer.ts",
      "src/otp/issuance.ts",
    ]) {
      for (const k of readEnvKeysUsedBy(f)) used.add(k);
    }

    const missing = [...used].filter((k) => !declared.has(k) && !runtimeProvided.has(k));
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("⚠ maps all FOUR audiences — a missing pool is a silent lockout for that audience", () => {
    const declared = readServerlessEnvKeys();
    for (const key of [
      "CUSTOMER_USER_POOL_ID",
      "DRIVER_USER_POOL_ID",
      "SHOP_USER_POOL_ID",
      "BACK_OFFICE_USER_POOL_ID",
    ]) {
      expect(declared.has(key), `serverless.yml must declare ${key}`).toBe(true);
    }
  });

  it("⚠ uses the HYPHENATED back-office SSM path", () => {
    // The SSM contract is /effy/<env>/auth/back-office/… — an underscore resolves to nothing and
    // the variable silently becomes empty, which is the same lockout by another route.
    //
    // ⚠ SCOPED TO THE DECLARATION LINE, not the whole file. The first version grepped the entire
    // yaml and failed — on the COMMENT two lines above the declaration, which names the wrong
    // spelling as a counter-example. A whole-file grep asserts against prose as well as config,
    // and prose is where the wrong value is most likely to appear legitimately.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const line = yaml
      .split("\n")
      .find((l) => /^\s*BACK_OFFICE_USER_POOL_ID:/.test(l));

    expect(line, "BACK_OFFICE_USER_POOL_ID is not declared").toBeDefined();
    expect(line).toContain("/auth/back-office/user_pool_id");
    expect(line).not.toContain("back_office");
  });
});
