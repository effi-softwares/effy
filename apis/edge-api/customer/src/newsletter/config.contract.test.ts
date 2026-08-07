import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { MAIL_ENV_KEYS } from "@effy/email-kit/send"

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the newsletter routes (039 US6).
 *
 * This is the FIFTH time this platform has guarded the same defect — 027 R13, 029, 033, 035, and now
 * here. In 035 an audience map read four environment variables `serverless.yml` never declared: every
 * pool resolved "unknown", **no email was ever sent**, and 100 passing tests missed it because the
 * tests set those variables themselves.
 *
 * A unit test that supplies its own configuration can never notice that the configuration does not
 * exist. So this one mocks nothing: it reads the ACTUAL `serverless.yml` and the ACTUAL service source
 * and asserts they agree.
 *
 * ⚠ The newsletter is exactly the shape that hides this failure. A missing `NEWSLETTER_CONFIRM_BASE_URL`
 * does not crash — it renders a confirm link of `?token=…` with no origin, which is a URL the mail
 * client will happily display and nobody can follow. Subscribing would appear to work, the email would
 * arrive, and confirmation would be impossible.
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

/** Every `env.SOMETHING` / `process.env.SOMETHING` the newsletter service actually reads. */
function readEnvKeysUsedBySource(): Set<string> {
  const source = readFileSync(resolve(here, "service.ts"), "utf8")
  const keys = new Set<string>()
  for (const m of source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) keys.add(m[1]!)
  return keys
}

describe("newsletter deployment contract — serverless.yml declares what the code reads", () => {
  const declared = readServerlessEnvKeys()

  it("declares every environment variable the newsletter service reads", () => {
    const used = readEnvKeysUsedBySource()

    expect(used.size, "the service reads no env at all — did the parser break?").toBeGreaterThan(0)

    const missing = [...used].filter((k) => !declared.has(k))
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([])
  })

  /**
   * ⚠ Self-checked against email-kit's own exported list rather than a copy of it. If email-kit adds a
   * `MAIL_*` key, this fails here instead of at the first send in dev.
   */
  it("declares every MAIL_* key email-kit requires to send the confirmation", () => {
    const missing = MAIL_ENV_KEYS.filter((k) => !declared.has(k))
    expect(missing, `serverless.yml is missing: ${missing.join(", ")}`).toEqual([])
  })

  it("declares the three newsletter keys by name", () => {
    for (const key of [
      "NEWSLETTER_CONFIRM_BASE_URL",
      "NEWSLETTER_TOKEN_TTL_HOURS",
      "NEWSLETTER_RESEND_COOLDOWN_MINUTES",
    ]) {
      expect(declared.has(key), `serverless.yml does not declare ${key}`).toBe(true)
    }
  })
})

describe("newsletter routes — the public posture is intentional and stays that way", () => {
  const yaml = readFileSync(resolve(serviceRoot, "serverless.yml"), "utf8")

  /**
   * ⚠ Subscribing must work for someone with no account. If an `authorizer` ever appears on these two
   * routes, the form silently 401s for every visitor it exists for — and the failure would look like a
   * frontend bug, because the page renders perfectly.
   */
  it("attaches no authorizer to either newsletter route", () => {
    for (const fn of ["customerNewsletterV1Post", "customerNewsletterV1Confirm"]) {
      const start = yaml.indexOf(`  ${fn}:`)
      expect(start, `${fn} is not declared in serverless.yml`).toBeGreaterThan(-1)

      const rest = yaml.slice(start + fn.length)
      const end = rest.search(/\n {2}[a-zA-Z]/)
      const block = end < 0 ? rest : rest.slice(0, end)

      expect(block, `${fn} must stay public`).not.toContain("authorizer")
    }
  })

  it("registers both routes at the paths the web app calls", () => {
    expect(yaml).toContain("path: /customer/v1/newsletter")
    expect(yaml).toContain("path: /customer/v1/newsletter/confirm")
  })
})
