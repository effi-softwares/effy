import { describe, expect, it } from "vitest"

import { createConfig } from "@effy/web-kit"

const REQUIRED_KEYS = [
  "VITE_COGNITO_USER_POOL_ID",
  "VITE_COGNITO_CLIENT_ID",
  "VITE_API_BASE_URL",
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

    expect(() => cfg.assert()).toThrow(new RegExp(key))
  })

  it("treats an empty string as missing, not as a value", () => {
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
