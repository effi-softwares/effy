import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  DELIVERY_NOTE_MAX,
  deliveryNoteLength,
  hasDeliveryInstructions,
  normaliseDeliveryInstructions,
  type DeliveryInstructionsResult,
} from "./delivery-instructions";

/**
 * ⚠ THE FIXTURE IS SHARED WITH GO. `apis/core-api/internal/platform/deliveryinstructions` reads this
 * same file. A case that passes here and fails there is the defect it exists to catch — 027 recorded
 * what happens when two languages each test their own half of one rule.
 */
interface Case {
  name: string;
  input: unknown;
  expect: DeliveryInstructionsResult;
}

const cases = JSON.parse(
  readFileSync(fileURLToPath(new URL("./delivery-instructions.fixtures.json", import.meta.url)), "utf8"),
) as Case[];

describe("066 — delivery instructions, the shared fixture", () => {
  it("is not empty (this suite would otherwise pass vacuously)", () => {
    expect(cases.length).toBeGreaterThan(15);
  });

  for (const c of cases) {
    it(c.name, () => {
      expect(normaliseDeliveryInstructions(c.input)).toEqual(c.expect);
    });
  }
});

describe("066 — delivery instructions", () => {
  it("undefined is no instructions, like null", () => {
    expect(normaliseDeliveryInstructions(undefined)).toEqual({ ok: true, value: { handover: null, note: null } });
  });

  it("missing keys are no instructions", () => {
    expect(normaliseDeliveryInstructions({})).toEqual({ ok: true, value: { handover: null, note: null } });
  });

  it("a non-object is refused", () => {
    expect(normaliseDeliveryInstructions("leave it")).toMatchObject({ ok: false });
    expect(normaliseDeliveryInstructions([])).toMatchObject({ ok: false });
  });

  /** FR-028 — a refusal is the kind of thing that gets logged, and a note may hold a gate code. */
  it("⚠ a refusal never carries the submitted text", () => {
    const secret = "GATE-CODE-4411 ".repeat(30);
    const out = normaliseDeliveryInstructions({ handover: null, note: secret });
    expect(out.ok).toBe(false);
    expect(JSON.stringify(out)).not.toContain("4411");
  });

  it("counts code points, so the limit is what a person sees", () => {
    expect(deliveryNoteLength("🚪🚪")).toBe(2);
    expect("🚪🚪".length).toBe(4);
    expect(DELIVERY_NOTE_MAX).toBe(250);
  });

  it("knows when there is nothing to show", () => {
    expect(hasDeliveryInstructions(null)).toBe(false);
    expect(hasDeliveryInstructions({ handover: null, note: null })).toBe(false);
    expect(hasDeliveryInstructions({ handover: "leave_at_door", note: null })).toBe(true);
    expect(hasDeliveryInstructions({ handover: null, note: "x" })).toBe(true);
  });
});
