import { describe, expect, it } from "vitest"

import { createConfig } from "@effy/web-kit"

/**
 * 059 T007 — the config fails LOUDLY, naming the key.
 *
 * ⚠ WHY THIS TEST EXISTS AT ALL. Four of the five values this slice adds are inert if wrong — a bad
 * `appId` produces an error in the console and nothing else. `VITE_VAPID_PUBLIC_KEY` is different:
 * without it `getToken()` never resolves, so the operator grants permission, sees the toggle turn
 * on, and owns a tablet that will never ring. Nothing fails. Nothing logs. The feature is simply
 * absent, and looks enabled.
 *
 * That is the exact shape the constitution's Real-World Identifiers rule names — "a wrong
 * outward-facing value that silently works is worse than a build that stops" — so the key is
 * REQUIRED and this test pins that it stays required.
 *
 * ⚠ The list is duplicated here rather than imported from `env.ts`. Importing it would make the test
 * agree with the code by construction, which is 027's R13 lesson: a fixture that agrees with the
 * implementation instead of with the requirement proves nothing. Adding a required key without
 * adding it here is intended to fail.
 */
const REQUIRED_KEYS = [
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
  "VITE_API_BASE_URL",
  "VITE_CORE_API_BASE_URL",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_VAPID_PUBLIC_KEY",
] as const

function fullEnv(): Record<string, string> {
  return Object.fromEntries(REQUIRED_KEYS.map((k) => [k, `value-for-${k}`]))
}

describe("shop-web config", () => {
  it("asserts clean when every required key is present", () => {
    const cfg = createConfig(REQUIRED_KEYS, fullEnv())
    expect(() => cfg.assert()).not.toThrow()
  })

  it.each(REQUIRED_KEYS)("fails NAMING the key when %s is missing", (key) => {
    const env = fullEnv()
    delete env[key]
    const cfg = createConfig(REQUIRED_KEYS, env)

    // Naming it is the whole point: "Missing required config" on its own sends an operator
    // looking through nine values.
    expect(() => cfg.assert()).toThrow(new RegExp(key))
  })

  it("treats an empty string as missing, not as a value", () => {
    // ⚠ An unset Amplify build variable arrives as "" rather than undefined, so a presence check
    // written as `key in env` would pass with nothing behind it.
    const env = { ...fullEnv(), VITE_VAPID_PUBLIC_KEY: "" }
    const cfg = createConfig(REQUIRED_KEYS, env)
    expect(() => cfg.assert()).toThrow(/VITE_VAPID_PUBLIC_KEY/)
  })

  it("refuses to hand out a required key that is absent, rather than returning undefined", () => {
    const env = fullEnv()
    delete env.VITE_VAPID_PUBLIC_KEY
    const cfg = createConfig(REQUIRED_KEYS, env)
    expect(() => cfg.require("VITE_VAPID_PUBLIC_KEY")).toThrow(/VITE_VAPID_PUBLIC_KEY/)
  })
})
