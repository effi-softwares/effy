import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { ShopNextCollectionDTO } from "@effy/shared-types"

import { NextCollection } from "../NextCollection"

const TZ = "Australia/Melbourne"
const next = (over: Partial<ShopNextCollectionDTO> = {}): ShopNextCollectionDTO => ({
  runAt: "2026-10-27T01:30:00.000Z",
  dayOffset: 0,
  driver: "none",
  opensAt: null,
  driverOnDuty: false,
  due: { ready: 4, picking: 2 },
  ...over,
})
const NOW = Date.parse("2026-10-27T00:00:00.000Z")

describe("Next collection (099)", () => {
  it("says when, who, and how many of this shop's orders are ready for it", () => {
    render(<NextCollection next={next()} timezone={TZ} now={NOW} loading={false} />)
    expect(screen.getByText("12:30 pm")).toBeInTheDocument()
    expect(screen.getByText("Effy driver")).toBeInTheDocument()
    expect(screen.getByText("4 ready · 2 still picking")).toBeInTheDocument()
    expect(screen.getByText("4 of 6")).toBeInTheDocument()
    expect(screen.getByText("No driver given the run yet")).toBeInTheDocument()
  })

  it("says a driver is on the way, and never names them", () => {
    render(<NextCollection next={next({ driver: "on_the_way", opensAt: "2026-10-26T23:45:00.000Z", driverOnDuty: true })} timezone={TZ} now={NOW} loading={false} />)
    expect(screen.getByText("Driver on the way")).toBeInTheDocument()
  })

  it("says so in one sentence when no runs are set up", () => {
    render(<NextCollection next={null} timezone={TZ} now={NOW} loading={false} />)
    expect(screen.getByText(/No collection runs are set up for your shop yet/)).toBeInTheDocument()
  })
})
