import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { starterSettings, type BannerDTO } from "@effy/shared-types"

vi.mock("@/lib/telemetry", () => ({ capture: vi.fn() }))

const { SkinnedPromotion } = await import("./SkinnedPromotion")
const { isDesigned } = await import("./skin-designed")
const { PromoHero } = await import("./PromoHero")

/** 095 — a promotion wears its place's skin; Classic (or no skin) keeps the pre-095 drawing. */
const banner = (over: Partial<BannerDTO> & Record<string, unknown> = {}) => ({
  key: "p1",
  title: "10% off the winter shop",
  subtitle: "3 times per customer",
  imageUrl: null,
  href: "/promotions/p1",
  code: null,
  terms: null,
  label: null,
  ...over,
})
const panel = { id: "s1", version: 1, layout: "panel" as const, size: "large" as const, settings: starterSettings("panel") }
const classic = { id: "s0", version: 1, layout: "classic" as const, size: "large" as const }

describe("SkinnedPromotion", () => {
  it("only a designed skin is drawn by the skin renderer", () => {
    expect(isDesigned(banner())).toBe(false)
    expect(isDesigned(banner({ skin: classic }))).toBe(false)
    expect(isDesigned(banner({ skin: panel }))).toBe(true)
  })

  it("draws the skin, linking to the offer", () => {
    render(<SkinnedPromotion banner={banner({ skin: panel })} groupKey="home-hero" />)
    expect(screen.getByTestId("promo-skin")).toHaveAttribute("data-layout", "panel")
    expect(screen.getByRole("link", { name: "View offer: 10% off the winter shop" })).toHaveAttribute("href", "/promotions/p1")
  })

  it("the hero draws designed slides in their skin and keeps the band for Classic ones", () => {
    render(<PromoHero slides={[banner({ skin: panel }), banner({ key: "p2", title: "Classic one", skin: classic })]} side={[]} />)
    expect(screen.getAllByTestId("promo-skin")).toHaveLength(1)
    expect(screen.getByRole("heading", { name: "Classic one" })).toBeInTheDocument()
  })

  it("an all-Classic hero is drawn as before 095", () => {
    render(<PromoHero slides={[banner({ skin: classic })]} side={[]} />)
    expect(screen.queryByTestId("promo-skin")).toBeNull()
    expect(screen.getByRole("heading", { name: "10% off the winter shop" })).toBeInTheDocument()
  })
})

describe("⚠ server components can call what they import (095 dev outage)", () => {
  it("SkinnedPromotion.tsx (\"use client\") exports components only — a helper a server component calls lives in skin-designed.ts", async () => {
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("app/(shop)/_components/SkinnedPromotion.tsx", "utf8")
    expect(src.startsWith('"use client"')).toBe(true)
    const exported = [...src.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1])
    expect(exported).toEqual(["SkinnedPromotion"])
  })
})
