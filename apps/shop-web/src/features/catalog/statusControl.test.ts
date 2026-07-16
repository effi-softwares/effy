import { describe, expect, it } from "vitest";

import { availableTransitions, canHardDelete, deleteGuardMessage } from "./statusControl";

// T073: the status menu offers only the transitions valid from the current status (data-model §4),
// and the delete guard offers hard-delete only for a draft (archive otherwise).

describe("availableTransitions", () => {
  it("draft → publish only", () => {
    expect(availableTransitions("draft").map((t) => t.status)).toEqual(["active"]);
  });
  it("active → unavailable or archived", () => {
    expect(availableTransitions("active").map((t) => t.status)).toEqual([
      "unavailable",
      "archived",
    ]);
  });
  it("unavailable → active or archived", () => {
    expect(availableTransitions("unavailable").map((t) => t.status)).toEqual([
      "active",
      "archived",
    ]);
  });
  it("archived → reactivate (active) only", () => {
    const t = availableTransitions("archived");
    expect(t.map((x) => x.status)).toEqual(["active"]);
    expect(t[0]?.label).toBe("Reactivate");
  });
});

describe("canHardDelete", () => {
  it("is true only for a draft", () => {
    expect(canHardDelete("draft")).toBe(true);
    expect(canHardDelete("active")).toBe(false);
    expect(canHardDelete("unavailable")).toBe(false);
    expect(canHardDelete("archived")).toBe(false);
  });
});

describe("deleteGuardMessage", () => {
  it("warns that a draft is permanently deleted", () => {
    expect(deleteGuardMessage("draft")).toMatch(/permanently deleted/i);
  });
  it("explains that a published product is archived instead", () => {
    expect(deleteGuardMessage("active")).toMatch(/archive it instead/i);
    expect(deleteGuardMessage("archived")).toMatch(/archive it instead/i);
  });
});
