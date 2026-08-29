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
    // ⚠ The trailing `undefined` is the 055 reason, absent for every transition but `unfulfillable`.
    expect(transitionRepo).toHaveBeenCalledWith(
      "f-1", "shop-1", "received", "picking", "staff-1", undefined,
    );
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

// ── 055 US6 — the exit a shop that cannot supply its portion previously lacked ──────────────────
//
// ⚠ BEFORE THIS, A SHOP HOLDING AN ORDER IT COULD NOT FILL HAD NO STATE TO MOVE IT TO. The portion
// sat in the active queue forever, and the only way out was for someone to stop looking at it.

describe("unfulfillable (055 US6)", () => {
  // ⚠ FR-031 — IT MOVES NO MONEY. The shop says "we cannot supply this"; a person decides the refund.
  // The strongest form of that guarantee is that this service cannot reach a payment at all: it has
  // no gateway, and the refund path lives in a different service behind a different pool.
  it("is a state change and nothing else", async () => {
    readStatus.mockResolvedValue("picking");
    transitionRepo.mockResolvedValue(true);
    readDetail.mockResolvedValue(DETAIL);

    await transition(ACTOR, "f-1", "unfulfillable", "the chiller failed overnight");

    expect(transitionRepo).toHaveBeenCalledWith(
      "f-1", "shop-1", "picking", "unfulfillable", "staff-1", "the chiller failed overnight",
    );
  });

  // ⚠ A REASON IS REQUIRED, and the database enforces it too. Back-office is asked to decide a refund
  // on the strength of this; "the shop said no" is not a basis for returning a customer's money.
  it.each(["", "   ", undefined])("is refused with %p as a reason", async (reason) => {
    readStatus.mockResolvedValue("picking");

    await expect(transition(ACTOR, "f-1", "unfulfillable", reason)).rejects.toMatchObject({
      kind: "validation",
    });
    expect(transitionRepo).not.toHaveBeenCalled();
  });

  // ⚠ T074 — ONCE COLLECTED IT IS NO LONGER THE SHOP'S CALL. The goods have left; somebody is
  // carrying them. The refusal costs no new code: `collected` is absent as a SOURCE in the legal-edge
  // map, so the machine simply has no entry that can move it (FR-011f).
  it.each(["collected", "delivered"])("is refused once the portion is %s", async (from) => {
    readStatus.mockResolvedValue(from as never);

    await expect(
      transition(ACTOR, "f-1", "unfulfillable", "we ran out"),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(transitionRepo).not.toHaveBeenCalled();
  });

  // ⚠ A shop may know BEFORE opening the order that it cannot supply it — the whole delivery is off,
  // the chiller failed. Requiring them to open it first would be ceremony.
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

  // ⚠ IT IS TERMINAL. A shop that said it cannot supply must not be able to un-say it: the platform
  // may already have refunded the customer on the strength of it.
  it.each(["picking", "ready_for_pickup"])("cannot be reversed to %s", async (to) => {
    readStatus.mockResolvedValue("unfulfillable" as never);

    await expect(transition(ACTOR, "f-1", to as never)).rejects.toMatchObject({ kind: "conflict" });
    expect(transitionRepo).not.toHaveBeenCalled();
  });

  // ⚠ `withdrawn` is a CANCELLATION, written by core-api, and a shop must never be able to leave it —
  // nor to claim it. Asserting it would be a shop claiming a customer cancelled.
  it("cannot be left once withdrawn by a cancellation", async () => {
    readStatus.mockResolvedValue("withdrawn" as never);

    await expect(
      transition(ACTOR, "f-1", "unfulfillable", "we ran out"),
    ).rejects.toMatchObject({ kind: "conflict" });
  });
});
