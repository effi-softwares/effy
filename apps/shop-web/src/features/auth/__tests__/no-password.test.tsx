import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

/**
 * US4 / constitution Principle IV (T038) — the shop console must never grow a password.
 *
 * ⚠ THIS EXISTS BECAUSE THE DESIGN THIS CONSOLE WAS REBUILT FROM HAS ONE. The imported mockup's
 * sign-in screen draws `<input type="password">`, a "Forgot?" link, and demotes the one-time code to a
 * secondary button. It is a perfectly ordinary SaaS sign-in and it is wrong for this audience: driver,
 * shop and admin are "strictly passwordless email one-time code, admin-provisioned", and the shop
 * Cognito pool has no password flow to accept one. A field that collects a credential the pool refuses
 * teaches the operator to doubt themselves.
 *
 * The next person to open that mockup will see the password field and reasonably assume it was an
 * oversight. This is the guard that tells them it was not.
 */
const AUTH_DIR = resolve(__dirname, "..")

function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue
      out.push(...sourceFiles(path))
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path)
    }
  }
  return out
}

describe("the shop console has no password anywhere", () => {
  const files = sourceFiles(AUTH_DIR)

  it("finds the auth sources to scan", () => {
    expect(files.length).toBeGreaterThan(2)
  })

  it("renders no password input", () => {
    const offenders = files.filter((f) => /type=["']password["']/.test(code(f)))
    expect(offenders).toEqual([])
  })

  it("offers no password recovery, because there is no password to recover", () => {
    const offenders = files.filter((f) =>
      /\bforgot\s+(your\s+)?password\b|\breset\s+password\b|\bForgot\?/i.test(code(f)),
    )
    expect(offenders).toEqual([])
  })

  it("never asks Amplify for a password flow", () => {
    const offenders = files.filter((f) =>
      /USER_PASSWORD_AUTH|USER_SRP_AUTH|\bsignIn\([^)]*password/i.test(code(f)),
    )
    expect(offenders).toEqual([])
  })
})
