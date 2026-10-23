import { afterEach, describe, expect, it, vi } from "vitest";

const readStatus = vi.hoisted(() => vi.fn());
const transitionRepo = vi.hoisted(() => vi.fn());
const readDetail = vi.hoisted(() => vi.fn());
const listQueueRepo = vi.hoisted(() => vi.fn());

vi.mock("./repository", () => ({
  readStatus,
  transition: transitionRepo,
  readDetail,
  listQueue: listQueueRepo,
}));

import { isLegalTransition, transition } from "./service";
import { isFulfillmentError } from "./types";
import type { FulfillmentStatus } from "./types";

const ACTOR = { sub: "sub-1", shopId: "shop-1", staffId: "staff-1" };
const DETAIL = { id: "f-1", status: "picking" };

// Reset after each test: clearing a mock whose last call rejected surfaces as an unhandled error.
afterEach(() => {
  for (const m of [
    readStatus,
    transitionRepo,
    readDetail,
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

  // `collected` is never a source in the transition table, so it is immutable.
  it.each(ALL)("refuses every transition out of collected (-> %s)", (to) => {
    expect(isLegalTransition("collected", to)).toBe(false);
  });

  // The one reversal; anything else backward is refused.
  it("permits ready_for_pickup -> picking but no other reversal", () => {
    expect(isLegalTransition("ready_for_pickup", "picking")).toBe(true);
    expect(isLegalTransition("picking", "received")).toBe(false);
    expect(isLegalTransition("received", "pending")).toBe(false);
  });

  // pending → received happens on first open, never on request.
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
    // The trailing `undefined` is the reason, set only for `unfulfillable`.
    expect(transitionRepo).toHaveBeenCalledWith(
      "f-1", "shop-1", "received", "picking", "staff-1", undefined,
    );
  });

  // Two operators at once: one transition applies, and the loser sees success.
  it("treats an already-applied transition as a benign no-op, not a conflict", async () => {
    readStatus.mockResolvedValue("picking");
    readDetail.mockResolvedValue(DETAIL);

    await expect(transition(ACTOR, "f-1", "picking")).resolves.toEqual(DETAIL);
    expect(transitionRepo).not.toHaveBeenCalled();
  });

  // Our read and write raced: the guarded UPDATE matched zero rows.
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

  // Missing and another shop's are one error; the handler answers 403.
  it("raises not_found for a portion outside the actor's shop", async () => {
    readStatus.mockResolvedValue(null);

    const err = await transition(ACTOR, "f-1", "picking").catch((e) => e);
    expect(isFulfillmentError(err) && err.kind).toBe("not_found");
  });

  // Shortfalls never block completion.
  it("completes a portion regardless of shortfalls", async () => {
    readStatus.mockResolvedValue("picking");
    transitionRepo.mockResolvedValue(true);
    readDetail.mockResolvedValue({ ...DETAIL, status: "ready_for_pickup" });

    await expect(transition(ACTOR, "f-1", "ready_for_pickup")).resolves.toMatchObject({
      status: "ready_for_pickup",
    });
  });
});

// A shop that cannot supply its portion can move it out of the active queue.

describe("unfulfillable (055 US6)", () => {
  // It moves no money: a person decides the refund.
  it("is a state change and nothing else", async () => {
    readStatus.mockResolvedValue("picking");
    transitionRepo.mockResolvedValue(true);
    readDetail.mockResolvedValue(DETAIL);

    await transition(ACTOR, "f-1", "unfulfillable", "the chiller failed overnight");

    expect(transitionRepo).toHaveBeenCalledWith(
      "f-1", "shop-1", "picking", "unfulfillable", "staff-1", "the chiller failed overnight",
    );
  });

  // A reason is required (the database enforces it too): back-office decides a refund on it.
  it.each(["", "   ", undefined])("is refused with %p as a reason", async (reason) => {
    readStatus.mockResolvedValue("picking");

    await expect(transition(ACTOR, "f-1", "unfulfillable", reason)).rejects.toMatchObject({
      kind: "validation",
    });
    expect(transitionRepo).not.toHaveBeenCalled();
  });

  // Once collected it is not the shop's call: `collected` is never a source.
  it.each(["collected", "delivered"])("is refused once the portion is %s", async (from) => {
    readStatus.mockResolvedValue(from as never);

    await expect(
      transition(ACTOR, "f-1", "unfulfillable", "we ran out"),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(transitionRepo).not.toHaveBeenCalled();
  });

  // A shop may know before opening the order.
  it.each(["pending", "received", "picking", "ready_for_pickup"])(
    "is reachable from %s",
    async (from) => {
      readStatus.mockResolvedValue(from as never);
      transitionRepo.mockResolvedValue(true);
      readDetail.mockResolvedValue(DETAIL);

      await expect(
        transition(ACTOR, "f-1", "unfulfillable", "the chiller failed"),
      ).resolves.toEqual(DETAIL);
    },
  );

  // Terminal: the customer may already have been refunded on it.
  it.each(["picking", "ready_for_pickup"])("cannot be reversed to %s", async (to) => {
    readStatus.mockResolvedValue("unfulfillable" as never);

    await expect(transition(ACTOR, "f-1", to as never)).rejects.toMatchObject({ kind: "conflict" });
    expect(transitionRepo).not.toHaveBeenCalled();
  });

  // `withdrawn` is a cancellation: a shop can never leave it nor claim it.
  it("cannot be left once withdrawn by a cancellation", async () => {
    readStatus.mockResolvedValue("withdrawn" as never);

    await expect(
      transition(ACTOR, "f-1", "unfulfillable", "we ran out"),
    ).rejects.toMatchObject({ kind: "conflict" });
  });
});
