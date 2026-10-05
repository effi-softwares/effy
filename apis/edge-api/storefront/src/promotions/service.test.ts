import { describe, expect, it } from "vitest";

import type { AdvertisedPromoRow, PromotionRepository } from "./repository";
import { createPromotionService, promoTerms, promoValidity, toBanner } from "./service";

const promo = (over: Partial<AdvertisedPromoRow> = {}): AdvertisedPromoRow => ({
  id: "11111111-1111-1111-1111-111111111111", code: "SPRING10", banner_title: "Spring", banner_subtitle: null,
  banner_image_key: null, banner_position: 2, minimum_subtotal_amount: "50.00", currency: "AUD",
  banner_placement: "top", ends_at: null, ...over,
});

describe("promoTerms", () => {
  it.each([
    ["50.00", "AUD", "On orders over $50.00"],
    ["50", "AUD", "On orders over $50.00"],
    ["0.99", "AUD", "On orders over $0.99"],
    ["50.00", "NZD", "On orders over 50.00 NZD"],
  ])("%s %s → %s", (min, cur, want) => {
    expect(promoTerms(min, cur)).toBe(want);
  });

  it.each(["0", "0.00", "-5", "abc", ""])("no minimum (%j) is no sentence at all", (min) => {
    expect(promoTerms(min, "AUD")).toBeNull();
  });
});

describe("promoValidity", () => {
  const now = new Date("2026-10-05T00:00:00Z");
  const inMs = (ms: number) => new Date(now.getTime() + ms);
  const H = 3600_000;

  it.each([
    [null, null],
    [inMs(-1), "Ended"],
    [inMs(0), "Ended"],
    [inMs(30 * 60_000), "Ends within the hour"],
    [inMs(H), "Ends in 1 hour"],
    [inMs(5 * H + 59 * 60_000), "Ends in 5 hours"],
    [inMs(24 * H), "Ends tomorrow"],
    [inMs(47 * H), "Ends tomorrow"],
    [inMs(48 * H), "Ends in 2 days"],
    [inMs(9 * 24 * H + H), "Ends in 9 days"],
  ])("%s → %s", (endsAt, want) => {
    expect(promoValidity(endsAt, now)).toBe(want);
  });
});

describe("banner", () => {
  it("targets its own promotion, with an integer position and the composed terms", async () => {
    const b = await toBanner(promo(), async () => null);
    expect(b).toEqual({
      key: "11111111-1111-1111-1111-111111111111", title: "Spring", subtitle: null, imageUrl: null,
      href: "/promotions/11111111-1111-1111-1111-111111111111", code: "SPRING10", terms: "On orders over $50.00",
      position: 2, target: { kind: "promotion", promotionId: "11111111-1111-1111-1111-111111111111" }, placement: "top",
    });
    expect(Number.isInteger(b.position)).toBe(true);
    // The target carries ONLY its own kind's field — no null siblings on the wire.
    expect(Object.keys(b.target!)).toEqual(["kind", "promotionId"]);
  });

  it("presigns the artwork when there is some", async () => {
    expect((await toBanner(promo({ banner_image_key: "promotions/x.jpg" }), async (k) => `signed:${k}`)).imageUrl).toBe("signed:promotions/x.jpg");
  });
});

describe("promotion service", () => {
  const repo = (rows: AdvertisedPromoRow[]): PromotionRepository => ({
    advertised: async () => rows,
    advertisedById: async (id) => rows.find((r) => r.id === id) ?? null,
  });

  it("no advertised promotion is an empty list, never absent", async () => {
    expect(await createPromotionService(repo([]), async () => null).banners()).toEqual([]);
  });

  it("detail carries the SAME terms sentence as the banner, plus validity", async () => {
    const svc = createPromotionService(repo([promo({ ends_at: new Date("2026-10-08T00:00:00Z") })]), async () => null);
    const detail = await svc.promotion("11111111-1111-1111-1111-111111111111", new Date("2026-10-05T00:00:00Z"));
    expect(detail).toEqual({
      id: "11111111-1111-1111-1111-111111111111", title: "Spring", subtitle: null, imageUrl: null,
      code: "SPRING10", terms: "On orders over $50.00", validity: "Ends in 3 days",
    });
    expect(detail?.terms).toBe((await svc.banners())[0]?.terms);
  });

  it("an unknown or unadvertised promotion is null", async () => {
    expect(await createPromotionService(repo([]), async () => null).promotion("nope")).toBeNull();
  });
});
