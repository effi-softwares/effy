import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { validateTours } from "@effy/web-kit/tour"
import { checkRoleFiltering, checkToursAgainstSpec, readTourInventory } from "@effy/web-kit/tour/testing"

import { CODE_TO_KEY, ROLE_MARKS } from "./codes"
import { BACK_OFFICE_TOURS } from "./tours"

/**
 * 107 FR-007/FR-008 and SC-003: back-office's tours say exactly what the spec says, within the limits, with the roles
 * its marks name - and no role is shown a step, or a tour, the spec keeps from it.
 */

const SPEC = resolve(__dirname, "../../../../../specs/107-backoffice-guided-tours/spec.md")
const input = { specPath: SPEC, codeToKey: CODE_TO_KEY, tours: BACK_OFFICE_TOURS, roleMarks: ROLE_MARKS }

describe("back-office tours (107)", () => {
  it("found the spec's inventory (the test must not pass vacuously)", () => {
    expect(readTourInventory(SPEC).size).toBe(57)
  })

  it("are within the limits: titles ≤ 40, texts ≤ 220, ≤ 12 steps, unique keys", () => {
    expect(validateTours(BACK_OFFICE_TOURS)).toEqual([])
  })

  it("say exactly what the spec says, step for step, with its roles", () => {
    expect(checkToursAgainstSpec(input)).toEqual([])
  })

  it.each(["csa", "manager", "admin"])("never show %s a step or a tour the spec keeps from them (SC-003)", (role) => {
    expect(checkRoleFiltering({ ...input, role })).toEqual([])
  })
})
