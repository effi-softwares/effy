import { afterEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  listOrders: vi.fn(),
  readOrder: vi.fn(),
  readActivity: vi.fn(),
  replaceTags: vi.fn(),
  addNote: vi.fn(),
}));
vi.mock("./repository", () => repo);

const fulfillmentsRepo = vi.hoisted(() => ({ acknowledge: vi.fn() }));
vi.mock("../fulfillments/repository", () => fulfillmentsRepo);

import type { ActivityRecord } from "./repository";
import { addNote, getActivity, getOrder, parseListQuery, setTags, toEntry } from "./service";

const ACTOR = { sub: "sub-1", shopId: "shop-1", staffId: "staff-1" };

afterEach(() => {
  vi.resetAllMocks();
});

describe("parseListQuery — the wire is optional, the query never is", () => {
  it("defaults every field", () => {
    expect(parseListQuery(null)).toEqual({
      tab: "all",
      q: "",
      attention: "any",
      payment: "any",
      method: "any",
      range: "any",
      sort: "placed",
      dir: "asc",
      page: 1,
      pageSize: 25,
    });
  });

  /**
   * ⚠ The replaced queue was strict FIFO (020 SC-020): the order that has waited longest is the one to
   * pick next. A console that opened newest-first would bury the most urgent work below the fold.
   */
  it("opens oldest-first, keeping the queue's FIFO default", () => {
    const q = parseListQuery({});
    expect(q.sort).toBe("placed");
    expect(q.dir).toBe("asc");
  });

  it("treats an unrecognised value as its default, never as a wider match", () => {
    const q = parseListQuery({
      tab: "everything",
      attention: "urgent",
      payment: "free",
      method: "drone",
      range: "forever",
      sort: "id; DROP TABLE x",
      dir: "sideways",
      page: "-4",
    });
    expect(q).toMatchObject({
      tab: "all",
      attention: "any",
      payment: "any",
      method: "any",
      range: "any",
      sort: "placed",
      dir: "asc",
      page: 1,
    });
  });

  it("accepts every documented value", () => {
    const q = parseListQuery({
      tab: "ready_for_pickup",
      attention: "short",
      payment: "partially_refunded",
      method: "same_day",
      range: "7d",
      sort: "total",
      dir: "desc",
      page: "3",
      q: "EFY-1",
    });
    expect(q).toMatchObject({
      tab: "ready_for_pickup",
      attention: "short",
      payment: "partially_refunded",
      method: "same_day",
      range: "7d",
      sort: "total",
      dir: "desc",
      page: 3,
      q: "EFY-1",
    });
  });
});

describe("opening an order acknowledges it (020 FR-011a)", () => {
  it("acknowledges BEFORE reading, so the answer reflects it", async () => {
    const calls: string[] = [];
    fulfillmentsRepo.acknowledge.mockImplementation(async () => void calls.push("ack"));
    repo.readOrder.mockImplementation(async () => {
      calls.push("read");
      return { id: "f-1" };
    });
    await getOrder(ACTOR, "f-1");
    expect(calls).toEqual(["ack", "read"]);
    expect(fulfillmentsRepo.acknowledge).toHaveBeenCalledWith("f-1", "shop-1", "staff-1");
  });
});

describe("tags", () => {
  it("trims, lower-cases and de-duplicates before writing", async () => {
    repo.replaceTags.mockResolvedValue(true);
    repo.readOrder.mockResolvedValue({ id: "f-1" });
    await setTags(ACTOR, "f-1", { tags: ["Fragile ", "fragile", " call first", ""] });
    expect(repo.replaceTags).toHaveBeenCalledWith("f-1", "shop-1", ["fragile", "call first"], "staff-1");
  });

  it("refuses more than ten, or one longer than 32 characters", async () => {
    await expect(
      setTags(ACTOR, "f-1", { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }),
    ).rejects.toMatchObject({ kind: "validation" });
    await expect(setTags(ACTOR, "f-1", { tags: ["x".repeat(33)] })).rejects.toMatchObject({
      kind: "validation",
    });
    expect(repo.replaceTags).not.toHaveBeenCalled();
  });

  it("refuses a body that is not a list of strings", async () => {
    await expect(setTags(ACTOR, "f-1", { tags: "fragile" })).rejects.toMatchObject({ kind: "validation" });
    await expect(setTags(ACTOR, "f-1", { tags: [1] })).rejects.toMatchObject({ kind: "validation" });
  });

  it("answers another shop's order as not-found (the handler makes that a uniform 403)", async () => {
    repo.replaceTags.mockResolvedValue(null);
    await expect(setTags(ACTOR, "f-x", { tags: [] })).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("notes", () => {
  it("refuses an empty or whitespace note", async () => {
    await expect(addNote(ACTOR, "f-1", { body: "   " })).rejects.toMatchObject({ kind: "validation" });
    await expect(addNote(ACTOR, "f-1", {})).rejects.toMatchObject({ kind: "validation" });
  });

  it("refuses a note over the limit", async () => {
    await expect(addNote(ACTOR, "f-1", { body: "x".repeat(2001) })).rejects.toMatchObject({
      kind: "validation",
    });
  });

  it("writes the trimmed body with the operator's staff id", async () => {
    repo.addNote.mockResolvedValue("n-1");
    repo.readOrder.mockResolvedValue({ id: "f-1" });
    await addNote(ACTOR, "f-1", { body: "  Leave at the side gate  " });
    expect(repo.addNote).toHaveBeenCalledWith("f-1", "shop-1", "Leave at the side gate", "staff-1");
  });
});

describe("activity", () => {
  it("answers another shop's order as not-found", async () => {
    repo.readActivity.mockResolvedValue(null);
    await expect(getActivity(ACTOR, "f-x")).rejects.toMatchObject({ kind: "not_found" });
  });
});

function record(over: Partial<ActivityRecord>): ActivityRecord {
  return {
    source: "event",
    id: "e-1",
    at: new Date("2026-09-10T01:00:00Z"),
    event_type: null,
    from_status: null,
    to_status: null,
    quantity: null,
    detail: null,
    item_name: null,
    amount: null,
    refund_status: null,
    refund_kind: null,
    actor_kind: "shop",
    actor_name: "Maya",
    ...over,
  };
}

describe("the log's wording", () => {
  it("says what happened and who did it", () => {
    const e = toEntry(record({ event_type: "item_unavailable", quantity: 2, item_name: "Oat milk" }));
    expect(e).toMatchObject({ title: "2 × Oat milk marked unavailable", actorLabel: "Maya", tone: "strong" });
  });

  it("names the one reversal distinctly — it is the signal an order was completed too early", () => {
    const e = toEntry(record({ event_type: "state_changed", from_status: "ready_for_pickup", to_status: "picking" }));
    expect(e).toMatchObject({ title: "Picking reopened", tone: "strong" });
  });

  it("drops the dev stub's placeholder suffix from the state word", () => {
    const e = toEntry(record({ event_type: "state_changed", from_status: "ready_for_pickup", to_status: "collected:placeholder:drv" }));
    expect(e.title).toBe("Marked collected");
  });

  /** ⚠ The log never copies a note's body — the words stay in the Notes section. */
  it("records that a note was added without repeating it", () => {
    const e = toEntry(record({ event_type: "note_added", detail: "secret words" }));
    expect(e.title).toBe("Internal note added");
    expect(JSON.stringify(e)).not.toContain("secret words");
  });

  it("says the resulting tag set, and says so when cleared", () => {
    expect(toEntry(record({ event_type: "tags_changed", detail: "fragile, vip" })).title).toBe("Tags set to fragile, vip");
    expect(toEntry(record({ event_type: "tags_changed", detail: "" })).title).toBe("Tags cleared");
  });

  /**
   * ⚠ "submitted" is not "returned" (055). A refund with the provider must not read as money back.
   */
  it("does not call a submitted refund returned", () => {
    const e = toEntry(record({ source: "refund", amount: "12.50", refund_status: "submitted", refund_kind: "item", actor_kind: "shop" }));
    expect(e.title).toBe("Refund of $12.50 sent — waiting for the bank");
    expect(e.title).not.toMatch(/returned/);
  });

  /** ⚠ An Effy employee is "Effy" on a shop's screen, never a name. */
  it("labels a back-office refund as Effy", () => {
    const e = toEntry(record({ source: "refund", amount: "5.00", refund_status: "succeeded", actor_kind: "back_office", actor_name: "Someone At Effy" }));
    expect(e.actorLabel).toBe("Effy");
  });

  it("keeps an unknown event type visible rather than dropping it", () => {
    expect(toEntry(record({ event_type: "brand_new_kind" })).title).toBe("brand_new_kind");
  });

  it("gives the driver's facts their own words", () => {
    expect(toEntry(record({ source: "collection", to_status: "collected", actor_kind: "driver" }))).toMatchObject({
      title: "Collected by an Effy driver",
      actorLabel: "Effy driver",
    });
    expect(toEntry(record({ source: "collection", to_status: "short", actor_kind: "driver" })).tone).toBe("strong");
    expect(toEntry(record({ source: "arrival", actor_kind: "effy" })).title).toBe("Delivered to the customer");
  });
});
