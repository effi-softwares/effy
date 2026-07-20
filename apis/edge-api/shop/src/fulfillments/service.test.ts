import { afterEach, describe, expect, it, vi } from "vitest";

const readStatus = vi.hoisted(() => vi.fn());
const transitionRepo = vi.hoisted(() => vi.fn());
const readDetail = vi.hoisted(() => vi.fn());
const updateItemProgressRepo = vi.hoisted(() => vi.fn());
const collectViaStubRepo = vi.hoisted(() => vi.fn());
const listQueueRepo = vi.hoisted(() => vi.fn());

vi.mock("./repository", () => ({
  readStatus,
  transition: transitionRepo,
  readDetail,
  updateItemProgress: updateItemProgressRepo,
  collectViaStub: collectViaStubRepo,
  listQueue: listQueueRepo,
}));

import { collectViaStub, isLegalTransition, transition, updateItemProgress } from "./service";
import { isFulfillmentError } from "./types";
import type { FulfillmentStatus } from "./types";

const ACTOR = { sub: "sub-1", shopId: "shop-1", staffId: "staff-1" };
const DETAIL = { id: "f-1", status: "picking" };

// Reset AFTER each test, not before: clearing a mock whose previous call rejected orphans vitest's
// result-tracking promise, which then surfaces as a spurious unhandled error.
afterEach(() => {
  for (const m of [
    readStatus,
    transitionRepo,
    readDetail,
    updateItemProgressRepo,
    collectViaStubRepo,
    listQueueRepo,
  ]) {
    m.mockReset();
  }
});

describe("state machine legality (FR-011, FR-011d, FR-011f)", () => {
  const ALL: FulfillmentStatus[] = [
    "pending",
    "received",
    "picking",
    "ready_for_pickup",
    "collected",
  ];

  it("admits exactly three edges and no others", () => {
    const legal = ALL.flatMap((from) =>
      ALL.filter((to) => isLegalTransition(from, to)).map((to) => `${from}->${to}`),
    );
    expect(legal.sort()).toEqual(
      ["received->picking", "picking->ready_for_pickup", "ready_for_pickup->picking"].sort(),
    );
  });

  // `collected` is absent as a SOURCE in the transition table, which is what makes it permanently
  // immutable — there is no entry any input can select (FR-011f).
  it.each(ALL)("refuses every transition out of collected (-> %s)", (to) => {
    expect(isLegalTransition("collected", to)).toBe(false);
  });

  // The reversal is deliberately singular. Anything else backward must stay refused.
  it("permits ready_for_pickup -> picking but no other reversal", () => {
    expect(isLegalTransition("ready_for_pickup", "picking")).toBe(true);
    expect(isLegalTransition("picking", "received")).toBe(false);
    expect(isLegalTransition("received", "pending")).toBe(false);
  });

  // pending -> received is implicit on first open (FR-011a), never client-requested.
  it("does not admit pending -> received as a requestable edge", () => {
    expect(isLegalTransition("pending", "received")).toBe(false);
  });
});

describe("transition()", () => {
  it("applies a legal transition", async () => {
    readStatus.mockResolvedValue("received");
    transitionRepo.mockResolvedValue(true);
    readDetail.mockResolvedValue(DETAIL);

    await expect(transition(ACTOR, "f-1", "picking")).resolves.toEqual(DETAIL);
    expect(transitionRepo).toHaveBeenCalledWith("f-1", "shop-1", "received", "picking", "staff-1");
  });

  // SC-005: two operators tapping at once must produce exactly ONE applied transition. The loser
  // sees success, not an error — a correct concurrent action must not look broken.
  it("treats an already-applied transition as a benign no-op, not a conflict", async () => {
    readStatus.mockResolvedValue("picking");
    readDetail.mockResolvedValue(DETAIL);

    await expect(transition(ACTOR, "f-1", "picking")).resolves.toEqual(DETAIL);
    expect(transitionRepo).not.toHaveBeenCalled();
  });

  // The race between our read and our write: the guarded UPDATE matches zero rows.
  it("re-reads when the guarded update loses the race and succeeds if it landed on the target", async () => {
    readStatus.mockResolvedValueOnce("received").mockResolvedValueOnce("picking");
    transitionRepo.mockResolvedValue(false);
    readDetail.mockResolvedValue(DETAIL);

    await expect(transition(ACTOR, "f-1", "picking")).resolves.toEqual(DETAIL);
  });

  it("conflicts when the race left the portion in some other state", async () => {
    readStatus.mockResolvedValueOnce("received").mockResolvedValueOnce("ready_for_pickup");
    transitionRepo.mockResolvedValue(false);

    const err = await transition(ACTOR, "f-1", "picking").catch((e) => e);
    expect(isFulfillmentError(err) && err.kind).toBe("conflict");
  });

  it.each([
    ["received", "ready_for_pickup"],
    ["pending", "picking"],
    ["collected", "picking"],
    ["collected", "ready_for_pickup"],
  ] as const)("refuses the illegal transition %s -> %s with a conflict", async (from, to) => {
    readStatus.mockResolvedValue(from);

    const err = await transition(ACTOR, "f-1", to).catch((e) => e);
    expect(isFulfillmentError(err) && err.kind).toBe("conflict");
    expect(transitionRepo).not.toHaveBeenCalled();
  });

  // Missing and another-shop's are the same error by construction; the handler maps it to 403 so
  // response codes cannot enumerate other shops' portions (SC-007).
  it("raises not_found for a portion outside the actor's shop", async () => {
    readStatus.mockResolvedValue(null);

    const err = await transition(ACTOR, "f-1", "picking").catch((e) => e);
    expect(isFulfillmentError(err) && err.kind).toBe("not_found");
  });

  // FR-010c / SC-012: shortfalls must never block completion.
  it("completes a portion regardless of shortfalls", async () => {
    readStatus.mockResolvedValue("picking");
    transitionRepo.mockResolvedValue(true);
    readDetail.mockResolvedValue({ ...DETAIL, status: "ready_for_pickup" });

    await expect(transition(ACTOR, "f-1", "ready_for_pickup")).resolves.toMatchObject({
      status: "ready_for_pickup",
    });
  });
});

describe("updateItemProgress()", () => {
  it("records absolute quantities while picking", async () => {
    readStatus.mockResolvedValue("picking");
    readDetail.mockResolvedValue(DETAIL);

    await updateItemProgress(ACTOR, "f-1", "oi-1", { gatheredQuantity: 2 });
    expect(updateItemProgressRepo).toHaveBeenCalledWith(
      "f-1",
      "shop-1",
      "oi-1",
      { gatheredQuantity: 2 },
      "staff-1",
    );
  });

  // FR-010d — un-flagging is simply a lower unavailable quantity.
  it("allows un-flagging an item that turned up", async () => {
    readStatus.mockResolvedValue("picking");
    readDetail.mockResolvedValue(DETAIL);

    await updateItemProgress(ACTOR, "f-1", "oi-1", { unavailableQuantity: 0 });
    expect(updateItemProgressRepo).toHaveBeenCalledWith(
      "f-1",
      "shop-1",
      "oi-1",
      { unavailableQuantity: 0 },
      "staff-1",
    );
  });

  it.each(["pending", "received", "ready_for_pickup", "collected"] as const)(
    "refuses item edits while %s",
    async (status) => {
      readStatus.mockResolvedValue(status);

      const err = await updateItemProgress(ACTOR, "f-1", "oi-1", { gatheredQuantity: 1 }).catch(
        (e) => e,
      );
      expect(isFulfillmentError(err) && err.kind).toBe("conflict");
      expect(updateItemProgressRepo).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["a negative quantity", { gatheredQuantity: -1 }],
    ["a fractional quantity", { gatheredQuantity: 1.5 }],
    ["a non-numeric quantity", { gatheredQuantity: "2" }],
    ["no fields at all", {}],
  ])("rejects %s with a validation error", async (_case, body) => {
    readStatus.mockResolvedValue("picking");

    const err = await updateItemProgress(ACTOR, "f-1", "oi-1", body as Record<string, unknown>).catch(
      (e) => e,
    );
    expect(isFulfillmentError(err) && err.kind).toBe("validation");
  });
});

describe("collectViaStub() — ⚠ dev-only scaffold", () => {
  it("collects a ready portion", async () => {
    readStatus.mockResolvedValue("ready_for_pickup");
    readDetail.mockResolvedValue({ ...DETAIL, status: "collected" });

    await collectViaStub(ACTOR, "f-1", "test-driver-1");
    expect(collectViaStubRepo).toHaveBeenCalledWith("f-1", "shop-1", "test-driver-1", "staff-1");
  });

  // FR-032: the stub must never skip, reverse, or shortcut an earlier state.
  it.each(["pending", "received", "picking", "collected"] as const)(
    "refuses to collect a %s portion",
    async (status) => {
      readStatus.mockResolvedValue(status);

      const err = await collectViaStub(ACTOR, "f-1", "d").catch((e) => e);
      expect(isFulfillmentError(err) && err.kind).toBe("conflict");
      expect(collectViaStubRepo).not.toHaveBeenCalled();
    },
  );

  it("requires a driver reference", async () => {
    const err = await collectViaStub(ACTOR, "f-1", "  ").catch((e) => e);
    expect(isFulfillmentError(err) && err.kind).toBe("validation");
    expect(readStatus).not.toHaveBeenCalled();
  });
});
