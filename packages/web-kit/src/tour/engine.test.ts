import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ConsoleTourStateDTO } from "@effy/shared-types";

import { validateTours, type TourDef } from "./define";
import {
  applyPatch,
  counter,
  isRevised,
  nextShown,
  resolveTarget,
  shouldOffer,
  shownSteps,
  tourStatus,
  welcomeFirst,
} from "./engine";

// jsdom lays nothing out: an element is "laid out" here unless it or an ancestor carries data-test-hidden.
const original = Element.prototype.getClientRects;
beforeEach(() => {
  Element.prototype.getClientRects = function (this: Element) {
    return (this.closest("[data-test-hidden]") ? [] : [{}]) as unknown as DOMRectList;
  };
});
afterEach(() => {
  Element.prototype.getClientRects = original;
  document.body.innerHTML = "";
});

const tour: TourDef = {
  key: "orders-table",
  version: 2,
  title: "Orders · Table",
  steps: [
    { target: "a", title: "A", text: "a" },
    { target: "b", title: "B", text: "b", managersOnly: true },
    { target: ["c", "c-button"], title: "C", text: "c" },
    { target: "d", title: "D", text: "d" },
  ],
};
const welcome: TourDef = { key: "welcome", version: 1, title: "Welcome", anyPage: true, steps: [{ target: null, title: "W", text: "w" }] };

const state = (over: Partial<ConsoleTourStateDTO> = {}): ConsoleTourStateDTO => ({ offerTours: true, seen: {}, ...over });
const seen = (version: number) => ({ version, outcome: "finished" as const, at: "2026-11-03T00:00:00.000Z" });

function page(html: string) {
  document.body.innerHTML = html;
}

describe("which steps show (106 FR-011, FR-012)", () => {
  it("skips a manager-only step for staff and keeps it for a manager", () => {
    page(`<i data-tour="a"></i><i data-tour="b"></i><i data-tour="c"></i><i data-tour="d"></i>`);
    expect(shownSteps(tour, { manager: false })).toEqual([0, 2, 3]);
    expect(shownSteps(tour, { manager: true })).toEqual([0, 1, 2, 3]);
  });

  it("skips a step whose part is absent or hidden", () => {
    page(`<i data-tour="a"></i><div hidden><i data-tour="c"></i></div><i data-tour="d" data-test-hidden></i>`);
    expect(shownSteps(tour, { manager: true })).toEqual([0]);
  });

  it("uses the narrow-screen stand-in when the first key is folded away", () => {
    page(`<i data-tour="c" data-test-hidden></i><button data-tour="c-button"></button>`);
    expect(resolveTarget(["c", "c-button"])?.tagName).toBe("BUTTON");
  });

  it("resolves twins to the one that is visible", () => {
    page(`<i id="phone" data-tour="a" data-test-hidden></i><i id="desk" data-tour="a"></i>`);
    expect(resolveTarget("a")?.id).toBe("desk");
  });

  it("still counts an element under aria-hidden as present (a closing menu marks the whole page)", () => {
    page(`<div aria-hidden="true" data-aria-hidden="true"><i id="x" data-tour="a"></i></div>`);
    expect(resolveTarget("a")?.id).toBe("x");
  });

  it("a centred step is always shown", () => {
    expect(resolveTarget(null)).toBeNull();
    expect(shownSteps(welcome, { manager: false })).toEqual([0]);
  });

  it("every step absent leaves nothing to show", () => {
    page(``);
    expect(shownSteps(tour, { manager: true })).toEqual([]);
  });
});

describe("moving through a tour (FR-009)", () => {
  beforeEach(() => page(`<i data-tour="a"></i><i data-tour="b"></i><i data-tour="d"></i>`));

  it("Next and Back step over what is not shown", () => {
    expect(nextShown(tour, 0, 1, { manager: false })).toBe(3);
    expect(nextShown(tour, 3, -1, { manager: false })).toBe(0);
    expect(nextShown(tour, 3, 1, { manager: false })).toBeNull();
    expect(nextShown(tour, 0, -1, { manager: false })).toBeNull();
  });

  it("the counter counts only the steps shown", () => {
    expect(counter(tour, 0, { manager: false })).toEqual({ step: 1, of: 2 });
    expect(counter(tour, 3, { manager: false })).toEqual({ step: 2, of: 2 });
    expect(counter(tour, 3, { manager: true })).toEqual({ step: 3, of: 3 });
  });
});

describe("the offer rule (data-model, FR-003, FR-021)", () => {
  it("offers a tour never seen, or seen at an older version", () => {
    expect(shouldOffer(tour, state())).toBe(true);
    expect(shouldOffer(tour, state({ seen: { "orders-table": seen(1) } }))).toBe(true);
    expect(isRevised(tour, state({ seen: { "orders-table": seen(1) } }))).toBe(true);
    expect(shouldOffer(tour, state({ seen: { "orders-table": seen(2) } }))).toBe(false);
    expect(isRevised(tour, state())).toBe(false);
  });

  it("offers nothing with the switch off - the Welcome tour included", () => {
    expect(shouldOffer(tour, state({ offerTours: false }))).toBe(false);
    expect(welcomeFirst([welcome, tour], state({ offerTours: false }))).toBeNull();
  });

  it("the Welcome tour comes first, and comes back when it is revised", () => {
    expect(welcomeFirst([welcome, tour], state())?.key).toBe("welcome");
    expect(welcomeFirst([welcome, tour], state({ seen: { welcome: seen(1) } }))).toBeNull();
    expect(welcomeFirst([{ ...welcome, version: 2 }, tour], state({ seen: { welcome: seen(1) } }))?.key).toBe("welcome");
  });

  it("a reset offers everything again", () => {
    const after = applyPatch(state({ seen: { welcome: seen(1), "orders-table": seen(2) } }), { reset: true });
    expect(shouldOffer(tour, after)).toBe(true);
    expect(welcomeFirst([welcome], after)?.key).toBe("welcome");
  });

  it("applies a write the way the server will", () => {
    const now = new Date("2026-11-03T10:00:00.000Z");
    expect(applyPatch(state(), { tour: "today", version: 1, outcome: "declined" }, now).seen.today).toEqual({
      version: 1,
      outcome: "declined",
      at: "2026-11-03T10:00:00.000Z",
    });
    expect(applyPatch(state(), { offerTours: false }).offerTours).toBe(false);
  });
});

describe("page status", () => {
  it("only a loaded page is ready", () => {
    expect(tourStatus({ isSuccess: false, isError: false })).toBe("loading");
    expect(tourStatus({ isSuccess: true, isError: false })).toBe("ready");
    expect(tourStatus({ isSuccess: false, isError: true })).toBe("error");
  });

});

describe("validateTours (FR-017)", () => {
  it("passes a sound list and names every problem in a bad one", () => {
    expect(validateTours([tour, welcome])).toEqual([]);
    const bad = validateTours([
      { ...tour, key: "Bad Key" },
      { ...welcome, key: "welcome", steps: [{ target: null, title: "x".repeat(41), text: "y".repeat(221) }] },
      { ...welcome, key: "welcome", steps: [] },
    ]);
    expect(bad.join(" | ")).toMatch(/Bad Key: the key/);
    expect(bad.join(" | ")).toMatch(/title is over 40/);
    expect(bad.join(" | ")).toMatch(/text is over 220/);
    expect(bad.join(" | ")).toMatch(/used twice/);
    expect(bad.join(" | ")).toMatch(/0 steps/);
  });
});
