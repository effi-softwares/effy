import { describe, expect, it } from "vitest"

import type { DriverBlockedReason } from "@effy/shared-types"

import { BLOCKED_LABEL, formatTime } from "./model"

describe("BLOCKED_LABEL — every blocking reason has words a person can act on", () => {
  const ALL_REASONS: DriverBlockedReason[] = [
    "no_capabilities",
    "suspended",
    "offboarded",
    "licence_expired",
    "no_vehicle",
    "vehicle_non_compliant",
  ]

  it("⚠ has a label for EVERY DriverBlockedReason, with no silent gap", () => {
    for (const reason of ALL_REASONS) {
      const label = BLOCKED_LABEL[reason]
      expect(label, `no label for blocked reason "${reason}"`).toBeTruthy()
      expect(label.length, `label for "${reason}" is too short to be actionable`).toBeGreaterThan(5)
    }
  })

  it("⚠ carries no MORE keys than the union, so a removed reason cannot linger as dead copy", () => {
    expect(Object.keys(BLOCKED_LABEL).sort()).toEqual([...ALL_REASONS].sort())
  })

  it("names the remedy's subject — the vehicle reason must not read as the driver's fault", () => {
    expect(BLOCKED_LABEL.vehicle_non_compliant.toLowerCase()).toContain("vehicle")
    expect(BLOCKED_LABEL.no_vehicle.toLowerCase()).toContain("vehicle")
  })
})

describe("formatTime — the operator's own clock", () => {
  it("renders in Melbourne time, not UTC", () => {
    // 2026-09-20T08:30:00Z is 6:30 pm in Melbourne (AEST, +10).
    expect(formatTime("2026-09-20T08:30:00.000Z")).toMatch(/6:30/)
  })

  it("degrades to an em dash rather than throwing on a bad value", () => {
    expect(formatTime("not-a-time")).toBe("—")
  })
})
