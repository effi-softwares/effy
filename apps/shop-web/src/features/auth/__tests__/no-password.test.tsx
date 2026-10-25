import { readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { describe, expect, it } from "vitest"

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
    const offenders = files.filter((f) => /USER_PASSWORD_AUTH|USER_SRP_AUTH|\bsignIn\([^)]*password/i.test(code(f)))
    expect(offenders).toEqual([])
  })
})
