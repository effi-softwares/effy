import { describe, expect, it } from "vitest";

import {
  availableTransitions,
  canHardDelete,
  deleteGuardMessage,
  removalAction,
  visibilityAction,
} from "./statusControl";

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

/* ── 057: the two named actions that replaced the "Change status" menu ─────────────────────────── */

describe("visibilityAction", () => {
  it("says what the operator gets, never the internal status name", () => {
    // ⚠ The whole point of the change. "Make unavailable" is a state machine talking to itself;
    // "Unpublish" is the outcome, and it is what the operator came to do.
    expect(visibilityAction("active")?.label).toBe("Unpublish");
    expect(visibilityAction("draft")?.label).toBe("Publish");
    expect(visibilityAction("unavailable")?.label).toBe("Publish");
    expect(visibilityAction("archived")?.label).toBe("Restore");
  });

  it("routes every publish to the one on-sale state", () => {
    // The state machine has exactly one `active`, so "put it on sale" has exactly one destination.
    expect(visibilityAction("draft")?.target).toBe("active");
    expect(visibilityAction("unavailable")?.target).toBe("active");
    expect(visibilityAction("archived")?.target).toBe("active");
    expect(visibilityAction("active")?.target).toBe("unavailable");
  });

  it("never offers a transition availableTransitions would refuse", () => {
    // ⚠ The two must not drift. The header button is a PRESENTATION of the state machine; if it
    // ever offers a move the machine does not have, the backend refuses and the operator is told
    // nothing useful about why.
    for (const status of ["draft", "active", "unavailable", "archived"] as const) {
      const action = visibilityAction(status);
      if (!action) continue;
      expect(availableTransitions(status).map((t) => t.status)).toContain(action.target);
    }
  });

  it("explains what happens to orders and to the stock count, not just 'are you sure'", () => {
    expect(visibilityAction("active")?.confirmBody).toMatch(/orders already placed are unaffected/i);
    expect(visibilityAction("active")?.confirmBody).toMatch(/nothing is deleted/i);
  });
});

describe("removalAction", () => {
  it("offers a permanent delete only for a draft", () => {
    expect(removalAction("draft")).toMatchObject({ kind: "delete" });
    expect(removalAction("active")).toMatchObject({ kind: "archive" });
    expect(removalAction("unavailable")).toMatchObject({ kind: "archive" });
  });

  it("agrees with canHardDelete rather than deciding separately", () => {
    // Two functions answering "can this be deleted" is how they come to disagree.
    for (const status of ["draft", "active", "unavailable", "archived"] as const) {
      const action = removalAction(status);
      const offersDelete = action?.kind === "delete";
      expect(offersDelete).toBe(canHardDelete(status) && status !== "archived");
    }
  });

  it("offers nothing for an archived product", () => {
    // ⚠ It is already removed, and the header's Restore is the only thing left to do to it. A second
    // control doing the same job is how two buttons drift apart.
    expect(removalAction("archived")).toBeNull();
  });

  it("promises the archive keeps the stock count and the history", () => {
    expect(removalAction("active")?.confirmBody).toMatch(/stock count/i);
    expect(removalAction("active")?.confirmBody).toMatch(/restore it at any time/i);
  });
});
