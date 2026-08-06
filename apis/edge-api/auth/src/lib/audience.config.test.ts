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

  it("⚠ declares the three mail-contract variables, and resolves each from SSM (037)", () => {
    // 037 replaced a hardcoded sender with the /effy/<env>/ses/* contract. The failure mode is
    // EXACTLY the one at the top of this file: the source reads a variable the deployment never
    // declares, every send throws, and no test notices because the tests set it themselves.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const declared = readServerlessEnvKeys();

    for (const key of ["MAIL_SENDER", "MAIL_REPLY_TO", "MAIL_CONFIGURATION_SET"]) {
      expect(declared.has(key), `serverless.yml must declare ${key}`).toBe(true);

      const line = yaml.split("\n").find((l) => new RegExp(`^\\s*${key}:`).test(l));
      expect(line, `${key} is not declared`).toBeDefined();

      // ⚠ It must come FROM SSM. A declared-but-hardcoded value would satisfy the key check above
      // while re-creating the exact drift the contract exists to end.
      expect(line, `${key} must resolve from the /effy/<env>/ses/* contract, not a literal`).toMatch(
        /\$\{ssm:\/effy\/\$\{sls:stage\}\/ses\/[a-z_]+\}/,
      );
    }
  });

  it("⚠ no longer declares the retired OTP_SENDER — a fallback would preserve the drift", () => {
    // Keeping the old name alongside the new one is the tempting, wrong move: it makes the change
    // safe-looking while leaving two sources of truth for one address, which is the defect.
    const declared = readServerlessEnvKeys();
    expect(declared.has("OTP_SENDER"), "OTP_SENDER must be removed, not kept as a fallback").toBe(
      false,
    );
  });

  it("⚠ hardcodes no sender address anywhere in the deployment config", () => {
    // The general form of the above. Comments are stripped first: this file's own history is
    // documented in a comment that legitimately names the retired literal, and asserting against
    // prose is how 035's hyphenation test failed the first time.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const config = yaml
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n");

    expect(config).not.toMatch(/no-reply@/);
  });

  it("⚠ grants ses:SendEmail on BOTH the identity and the configuration set", () => {
    // ⚠ THE OUTAGE THIS EXISTS TO PREVENT. `ses:SendEmail` is authorized against every resource the
    // request touches. This service's send names a configuration set (037, so the outcome is
    // attributable), so it touches TWO: the identity and the configuration set. The deployed policy
    // named only the identity, and every send failed with `AccessDeniedException` — an error that
    // names neither resource, so it reads like a verification or sandbox problem.
    //
    // ⚠ A failed send IS a failed sign-in for driver, shop and back-office, which have no password
    // and no federated route. This was a total sign-in outage on all four pools, and `mail-verify`
    // reported 17/17 green throughout: being AUTHORIZED to send (DKIM, SPF, DMARC, a verified
    // identity) and being PERMITTED to send (IAM) are different facts, and it only checks the first.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8");
    const lines = yaml.split("\n").filter((l) => !/^\s*#/.test(l));

    const sesLine = lines.findIndex((l) => /Action:\s*ses:SendEmail/.test(l));
    expect(sesLine, "no ses:SendEmail statement found").toBeGreaterThanOrEqual(0);

    const block: string[] = [];
    for (let i = sesLine + 1; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (block.length > 0 && !/^\s*-\s/.test(line)) break;
      block.push(line);
      if (block.length === 1 && !/Resource:\s*$/.test(line)) break; // single-line form
    }
    const resources = block.join("\n");

    expect(resources).toMatch(/Resource:/);
    expect(resources, 'ses:SendEmail must not be granted on "*"').not.toMatch(/"\*"/);
    expect(resources, "must name this environment's identity").toContain("/ses/identity_arn");
    expect(
      resources,
      "must ALSO name the configuration set — a send that specifies one is authorized against both",
    ).toContain("/ses/configuration_set_arn");
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
