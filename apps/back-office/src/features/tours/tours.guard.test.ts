import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { tourCoverage } from "@effy/web-kit/tour/testing"

import { BACK_OFFICE_TOURS } from "./tours"

/**
 * 107 FR-003 / SC-001: every back-office page has a tour, and no step points at nothing - followed from each route
 * through its screen and what that screen renders (`tourCoverage`).
 */

const SRC = resolve(__dirname, "../..")

const coverage = tourCoverage({
  srcDir: SRC,
  kitDir: resolve(__dirname, "../../../../../packages/web-kit/src"),
  ignoreRouteFiles: ["auth.tsx", "__root.tsx"],
  // The protected layout is the shell, not a page.
  ignoreRoutePaths: ["protected", "app", "_app", "?"],
  navFile: resolve(SRC, "components/shell/nav.ts"),
  toursDir: __dirname,
  tours: BACK_OFFICE_TOURS,
})

describe("107 - every back-office page has a tour, and every tour points at something", () => {
  it("found the routes (the guard must not pass vacuously)", () => {
    expect(coverage.pages.length).toBeGreaterThanOrEqual(40)
  })

  it("every route registers a tour", () => {
    expect(coverage.routesWithoutTour).toEqual([])
    expect(coverage.unknownKeys).toEqual([])
  })

  it("every tour is some page's, or the whole-console tour", () => {
    expect(coverage.orphanTours).toEqual([])
  })

  it("every step's target exists in the source", () => {
    expect(coverage.missingTargets).toEqual([])
  })

  it("the page-level keys a tour names are on that tour's own screen", () => {
    expect(coverage.pageLevelMisses).toEqual([])
  })
})
