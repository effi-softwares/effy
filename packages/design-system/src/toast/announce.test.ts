import { describe, expect, it } from "vitest";

import { nextLive, regionFor, spokenText } from "./announce";

describe("announce", () => {
  it("failures are urgent, everything else polite", () => {
    expect(regionFor("error")).toBe("assertive");
    for (const k of ["success", "info", "warning", "loading"] as const) expect(regionFor(k)).toBe("polite");
  });

  it("says the title, then the second line", () => {
    expect(spokenText({ title: "Saved" })).toBe("Saved");
    expect(spokenText({ title: "Saved", description: "6 orders" })).toBe("Saved. 6 orders");
    expect(spokenText({ title: "Saved.", description: "6 orders" })).toBe("Saved. 6 orders");
  });

  it("new words are written at once", () => {
    const r = nextLive({ polite: "Saved.", assertive: "" }, "polite", "Copied.");
    expect(r.now.polite).toBe("Copied.");
    expect(r.later).toBeNull();
  });

  it("the same words are cleared, then written again", () => {
    const r = nextLive({ polite: "Saved.", assertive: "Failed." }, "polite", "Saved.");
    expect(r.now).toEqual({ polite: "", assertive: "Failed." });
    expect(r.later).toEqual({ polite: "Saved.", assertive: "Failed." });
  });
});
