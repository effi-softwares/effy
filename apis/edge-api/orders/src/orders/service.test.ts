import * as shared from "@effy/edge-shared";
import { describe, expect, it } from "vitest";

import { COUNTED_REFUND_STATUSES, stageFor } from "./service";

/**
 * The console shows an operator the word the CUSTOMER is currently being shown, and a refund ceiling
 * the server will actually honour.
 *
 * ⚠ UNTIL 070 BOTH WERE SECOND IMPLEMENTATIONS of rules owned by the Go backend, and this file kept
 * them honest by READING THE GO SOURCE and comparing. That backend is retired. The rules now live
 * once, in the shared library, where their behaviour is tested (`order-completion.test.ts`).
 *
 * What is left to guard here is the thing that would bring the hazard back: this service growing
 * its OWN copy again. So the assertion is identity, not behaviour — a local re-implementation that
 * happened to agree today would still fail.
 */
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
