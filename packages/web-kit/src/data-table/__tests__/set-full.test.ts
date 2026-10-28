import { describe, expect, it } from "vitest";

import { setFullText } from "../set-full";

const SENTENCE = "This list is full (500). Remove one before adding another.";

describe("setFullText (103 FR-024)", () => {
  it("reads a full set's refusal by its code or its sentence", () => {
    expect(setFullText({ kind: "conflict", status: 409, type: "https://effy/problems/limit-reached" })).toBe(SENTENCE);
    expect(setFullText({ kind: "conflict", status: 409, type: "conflict", detail: SENTENCE })).toBe(SENTENCE);
  });

  it("leaves every other refusal to the screen's own words", () => {
    expect(setFullText({ kind: "conflict", status: 409, type: "conflict", detail: "name taken" })).toBeNull();
    expect(setFullText({ kind: "validation", status: 400, detail: SENTENCE })).toBeNull();
    expect(setFullText(new Error("x"))).toBeNull();
  });
});
