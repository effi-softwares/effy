import { describe, expect, it } from "vitest";

import { inboxArrivals, inboxArrivalTitle } from "./notification-inbox";

const item = (id: string, createdAt: string, o: Partial<{ type: string; readAt: string | null; title: string }> = {}) => ({
  id,
  createdAt,
  type: o.type ?? "order_ready",
  readAt: o.readAt ?? null,
  title: o.title ?? `Item ${id}`,
});

describe("inboxArrivals (120 R8)", () => {
  it("on first look nothing is new; it only sets the mark", () => {
    const r = inboxArrivals({ pinned: [], items: [item("a", "2026-11-13T09:00:00Z")] }, null);
    expect(r).toEqual({ arrived: [], newest: "2026-11-13T09:00:00Z" });
  });

  it("finds unread items newer than the mark, newest first, pinned ones too", () => {
    const page = {
      pinned: [item("p", "2026-11-13T09:05:00Z")],
      items: [item("b", "2026-11-13T09:04:00Z"), item("old", "2026-11-13T08:59:00Z"), item("read", "2026-11-13T09:03:00Z", { readAt: "x" })],
    };
    const r = inboxArrivals(page, "2026-11-13T09:00:00Z");
    expect(r.arrived.map((i) => i.id)).toEqual(["p", "b"]);
    expect(r.newest).toBe("2026-11-13T09:05:00Z");
  });

  it("leaves out excluded types and items about the page the person is on", () => {
    const page = { pinned: [], items: [item("n", "2026-11-13T09:02:00Z", { type: "shop_new_order" }), item("h", "2026-11-13T09:01:00Z")] };
    const r = inboxArrivals(page, "2026-11-13T09:00:00Z", { exclude: ["shop_new_order"], isHere: (i) => i.id === "h" });
    expect(r.arrived).toEqual([]);
    expect(r.newest).toBe("2026-11-13T09:02:00Z");
  });

  it("one arrival says its title; several say how many", () => {
    expect(inboxArrivalTitle([{ title: "Your order is on its way" }])).toBe("Your order is on its way");
    expect(inboxArrivalTitle([{ title: "a" }, { title: "b" }])).toBe("2 new notifications");
  });
});
