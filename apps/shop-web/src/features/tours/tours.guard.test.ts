import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { tourCoverage } from "@effy/web-kit/tour/testing"

import { SHOP_TOURS } from "./tours"

/**
 * 106 FR-001 / FR-019 / SC-001: every page of the shop console has a tour, and no step points at nothing. Followed from
 * each route through its screen and what that screen renders (see `tourCoverage`).
 */

const SRC = resolve(__dirname, "../..")

const coverage = tourCoverage({
  srcDir: SRC,
  kitDir: resolve(__dirname, "../../../../../packages/web-kit/src"),
  ignoreRouteFiles: ["auth.tsx", "__root.tsx"],
  ignoreRoutePaths: ["protected"],
  navFile: resolve(SRC, "components/layout/nav.ts"),
  toursDir: __dirname,
  tours: SHOP_TOURS,
})

describe("106 - every shop console page has a tour, and every tour points at something", () => {
  it("found the routes (the guard must not pass vacuously)", () => {
    expect(coverage.pages.length).toBeGreaterThanOrEqual(14)
  })

  it("every route registers a tour", () => {
    expect(coverage.routesWithoutTour).toEqual([])
    expect(coverage.unknownKeys).toEqual([])
  })

  it("every tour is some page's, or the whole-console tour", () => {
    expect(coverage.orphanTours).toEqual([])
  })

  it("defines all nineteen tours", () => {
    expect(SHOP_TOURS.length).toBe(19)
  })

  it("every step's target exists in the source", () => {
    expect(coverage.missingTargets).toEqual([])
  })

  it("the page-level keys a tour names are on that tour's own screen", () => {
    expect(coverage.pageLevelMisses).toEqual([])
  })
})
