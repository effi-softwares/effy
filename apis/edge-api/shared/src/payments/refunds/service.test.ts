import { describe, expect, it } from "vitest";

import {
  AmountInvalidError, AmountRejectedError, InvalidActorKindError, InvalidReasonError, NoLinesError, NoteRequiredError,
} from "./errors";
import { cancelIdempotencyKey, goodwillCents, refundIdempotencyKey, validateIssue, type IssueInput } from "./service";
import { settledStatus } from "./state";

const base: IssueInput = { orderId: "o", kind: "item", reason: "item_not_supplied", note: "", lines: [{ orderItemId: "i", quantity: 1 }], amount: "", actorSub: "s", actorKind: "back_office" };

describe("what a valid refund is", () => {
  it("accepts an item refund and a goodwill refund", () => {
    expect(() => validateIssue(base)).not.toThrow();
    expect(() => validateIssue({ ...base, kind: "goodwill", reason: "goodwill", note: "sorry", lines: [], amount: "5.00" })).not.toThrow();
    expect(() => validateIssue({ ...base, actorKind: "shop" })).not.toThrow();
  });

  it.each([
    ["an actor kind no request may claim", { actorKind: "system" }, InvalidActorKindError],
    ["a customer as issuer", { actorKind: "customer" }, InvalidActorKindError],
    ["an unknown reason", { reason: "because" }, InvalidReasonError],
    ["an unknown kind", { kind: "cancellation" }, InvalidReasonError],
    ["goodwill as an item reason", { reason: "goodwill" }, InvalidReasonError],
    ["an item refund with no lines", { lines: [] }, NoLinesError],
    ["an item refund that also names an amount", { amount: "5.00" }, AmountRejectedError],
    ["goodwill with an item reason", { kind: "goodwill", note: "x", amount: "1.00" }, InvalidReasonError],
    ["goodwill with no note", { kind: "goodwill", reason: "goodwill", amount: "1.00" }, NoteRequiredError],
  ] as const)("refuses %s", (_name, over, error) => {
    expect(() => validateIssue({ ...base, ...over } as IssueInput)).toThrow(error);
  });

  it("a goodwill amount is bounded, and extra decimal places are refused rather than truncated", () => {
    expect(goodwillCents("12.34")).toBe(1234);
    expect(goodwillCents(" 5 ")).toBe(500);
    expect(goodwillCents("100000.00")).toBe(10_000_000);
    for (const bad of ["12.345", "0", "0.00", "-1.00", "100000.01", "", "abc", "1e3", "1,000.00"]) {
      expect(() => goodwillCents(bad), bad).toThrow(AmountInvalidError);
    }
  });
});

describe("idempotency keys", () => {
  it("⚠ is byte-identical to the key the retired backend derived, so a retry across the cut-over is one refund", () => {
    // sha256("refund:o1:item:item_not_supplied:500:i1 x1:i2 x2"), computed independently.
    expect(
      refundIdempotencyKey({ orderId: "o1", kind: "item", reason: "item_not_supplied", lines: [{ orderItemId: "i1", quantity: 1 }, { orderItemId: "i2", quantity: 2 }] }, 500),
    ).toBe(EXPECTED_KEY);
  });

  it("covers every parameter of the action", () => {
    const k = (over: Partial<IssueInput>, cents = 500) => refundIdempotencyKey({ ...base, ...over }, cents);
    const keys = new Set([k({}), k({ orderId: "other" }), k({ kind: "goodwill" }), k({ reason: "item_unusable" }), k({}, 501), k({ lines: [{ orderItemId: "i", quantity: 2 }] })]);
    expect(keys.size).toBe(6);
    expect(k({ actorSub: "someone-else" })).toBe(k({})); // who asked does not make it a different refund
  });

  it("a cancellation's key is the order alone", () => {
    expect(cancelIdempotencyKey("abc")).toBe("cancel:abc");
  });
});

describe("the provider's outcomes", () => {
  it("failed and canceled are different endings, and unfinished is not an ending", () => {
    expect(settledStatus("succeeded")).toBe("succeeded");
    expect(settledStatus("failed")).toBe("failed");
    expect(settledStatus("canceled")).toBe("refused");
    expect(settledStatus("pending")).toBeNull();
    expect(settledStatus("requires_action")).toBeNull();
    expect(settledStatus(undefined)).toBeNull();
  });
});

const EXPECTED_KEY = "777f0f468478fdebb4c2c22196ccbca70c3f7b6af9b9a89cbf1bdae1d2cb9fc7";

describe("where money metrics go", () => {
  it("one namespace for every service that moves money — the alarms watch exactly this one", async () => {
    const { MONEY_METRIC_NAMESPACE } = await import("../index");
    expect(MONEY_METRIC_NAMESPACE).toBe("Effy/Commerce");
    // The service's own copy of the constant (it cannot import the index that imports it).
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("./service.ts", import.meta.url), "utf8");
    expect(src).toContain(`const MONEY_METRIC_NAMESPACE = "${MONEY_METRIC_NAMESPACE}";`);
  });
});
