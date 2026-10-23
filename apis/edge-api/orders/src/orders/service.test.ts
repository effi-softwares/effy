import * as shared from "@effy/edge-shared";
import { describe, expect, it } from "vitest";

import { COUNTED_REFUND_STATUSES, stageFor } from "./service";

/** The stage word and refund ceiling must be the shared library's own functions, not a local copy. */
describe("the console's order rules are the shared ones, not a copy", () => {
  it("stageFor is the function the shopper's own order page calls", () => {
    expect(stageFor).toBe(shared.stageFor);
  });

  it("the refund ceiling's status set is the one refunds are issued against", () => {
    expect(COUNTED_REFUND_STATUSES).toBe(shared.COUNTED_REFUND_STATUSES);
  });

  it("still says what an operator needs it to say", () => {
    expect(stageFor(["delivered", "picking"])).toBe("packing");
    expect(stageFor(["ready_for_pickup"])).toBe("packing");
    expect(COUNTED_REFUND_STATUSES).not.toContain("submitting");
    expect(COUNTED_REFUND_STATUSES).not.toContain("refused");
  });
});
