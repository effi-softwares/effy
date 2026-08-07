import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { MAIL_ENV_KEYS } from "@effy/email-kit/send"

/**
 * ⚠ THE DEPLOYMENT CONTRACT for edge-customer (037).
 *
 * This service has never had one, and it sends mail. The failure it guards against has now happened
 * FOUR times on this platform — 027 R13, 029, 033, and 035, where an audience map read four
 * environment variables `serverless.yml` never declared: every pool resolved "unknown", no email was
 * ever sent, and **100 passing tests missed it because they set those variables themselves**.
 *
 * A unit test that mocks its own configuration can never notice that the configuration does not
 * exist. So this test mocks nothing: it reads the ACTUAL `serverless.yml` and the ACTUAL source and
 * asserts they agree.
 *
 * Mirrors `apis/edge-api/auth/src/lib/audience.config.test.ts` on purpose — the same defect deserves
 * the same shape of guard, not a bespoke one.
 */

const here = dirname(fileURLToPath(import.meta.url))
const serviceRoot = resolve(here, "../..")

function readServerlessEnvKeys(): Set<string> {
  const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")

  const start = yaml.indexOf("\n  environment:\n")
  if (start < 0) throw new Error("serverless.yml has no provider.environment block")
  const rest = yaml.slice(start + "\n  environment:\n".length)
  const end = rest.search(/\n {2}[a-z]/)
  const block = end < 0 ? rest : rest.slice(0, end)

  const keys = new Set<string>()
  for (const line of block.split("\n")) {
    const m = /^ {4}([A-Z][A-Z0-9_]*):/.exec(line)
    if (m?.[1]) keys.add(m[1])
  }
  return keys
}

function readEnvKeysUsedBy(relativePath: string): Set<string> {
  const src = readFileSync(resolve(serviceRoot, relativePath), "utf8")
  const keys = new Set<string>()
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    if (m[1]) keys.add(m[1])
  }
  return keys
}

describe("deployment configuration", () => {
  it("⚠ declares every environment variable the mail path reads", () => {
    // ⚠ Since 038 the mail path reads its environment inside `@effy/email-kit/send`, not here. So the
    // contract is now: this service's serverless.yml declares every variable EMAIL-KIT reads. The
    // list is exported and self-checked against email-kit's real source (email-kit/test/send.test.ts),
    // so it cannot silently drift from what the code actually reads — which was 035's exact defect.
    const declared = readServerlessEnvKeys()

    expect(MAIL_ENV_KEYS.length).toBeGreaterThan(0) // guard: never vacuous
    const missing = MAIL_ENV_KEYS.filter((k) => !declared.has(k))
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([])
  })

  it("⚠ notify.ts itself reads NO process.env — the env is email-kit's to read", () => {
    // A positive assertion that delegation is complete: a stray `process.env.MAIL_*` left behind in
    // notify.ts would be a second, un-contracted reader — the very split-brain 037 removed.
    const used = readEnvKeysUsedBy("src/password/notify.ts")
    expect([...used], `notify.ts must not read env directly: ${[...used].join(", ")}`).toEqual([])
  })

  it("⚠ resolves the mail contract from SSM, not from a literal (037)", () => {
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")
    const declared = readServerlessEnvKeys()

    for (const key of ["MAIL_SENDER", "MAIL_REPLY_TO", "MAIL_CONFIGURATION_SET"]) {
      expect(declared.has(key), `serverless.yml must declare ${key}`).toBe(true)

      const line = yaml.split("\n").find((l) => new RegExp(`^\\s*${key}:`).test(l))
      expect(line, `${key} is not declared`).toBeDefined()
      expect(line, `${key} must come from /effy/<env>/ses/*`).toMatch(
        /\$\{ssm:\/effy\/\$\{sls:stage\}\/ses\/[a-z_]+\}/,
      )
    }
  })

  it("⚠ no longer declares the retired NOTIFY_SENDER", () => {
    // It was a second hardcoded copy of the same address edge-auth hardcoded, while Terraform
    // published a third in a different shape. Keeping it as a fallback preserves the drift.
    const declared = readServerlessEnvKeys()
    expect(declared.has("NOTIFY_SENDER")).toBe(false)
  })

  it("⚠ grants ses:SendEmail on BOTH the identity and the configuration set, never on \"*\"", () => {
    // Two requirements in one statement, and the second one is why this test was rewritten.
    //
    // FR-043: the grant was `Resource: "*"` — permission to send as ANY verified identity in the
    // account, including the future production one. edge-auth's own comment called it out and
    // declined to copy it; nobody fixed it until 037.
    //
    // ⚠ AND THEN NARROWING IT BROKE SENDING ENTIRELY. `ses:SendEmail` is authorized against every
    // resource the request touches, and 037 made every send name a configuration set. Identity-only
    // therefore denies the call — `AccessDeniedException`, naming neither resource. Sign-in was
    // down on all four pools.
    //
    // ⚠ THE PREVIOUS VERSION OF THIS TEST WATCHED IT HAPPEN. It asserted the resource line
    // `toContain("/ses/identity_arn")` and passed — because that was true, and insufficient. It
    // encoded what the code said instead of what SES requires: 027 R13's lesson, recurring for the
    // fifth time in this repo. It now asserts BOTH resources, which is falsifiable by the real
    // failure.
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")
    const lines = yaml.split("\n").filter((l) => !/^\s*#/.test(l))

    const sesLine = lines.findIndex((l) => /Action:\s*ses:SendEmail/.test(l))
    expect(sesLine, "no ses:SendEmail statement found").toBeGreaterThanOrEqual(0)

    // The statement's resources: the `Resource:` key plus every list item until the block ends.
    const block: string[] = []
    for (let i = sesLine + 1; i < lines.length; i++) {
      const line = lines[i] ?? ""
      if (block.length > 0 && !/^\s*-\s/.test(line)) break
      block.push(line)
      if (block.length === 1 && !/Resource:\s*$/.test(line)) break // single-line form
    }
    const resources = block.join("\n")

    expect(resources).toMatch(/Resource:/)
    expect(resources, 'ses:SendEmail must not be granted on "*"').not.toMatch(/"\*"/)
    expect(resources, "must name this environment's identity").toContain("/ses/identity_arn")
    expect(
      resources,
      "must ALSO name the configuration set — a send that specifies one is authorized against both",
    ).toContain("/ses/configuration_set_arn")
  })

  it("⚠ hardcodes no sender address anywhere in the deployment config", () => {
    const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")
    const config = yaml
      .split("\n")
      .filter((l) => !/^\s*#/.test(l))
      .join("\n")

    expect(config).not.toMatch(/no-reply@/)
  })
})
