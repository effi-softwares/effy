import { describe, expect, it } from "vitest";

import { isMessageError } from "./errors";
import { parseDraft } from "./service";

/** 112 - a draft from the wire: the closed shape, the kind's audiences, each filter and destination (contracts). */
const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";

const announcement = {
  kind: "announcement",
  title: "Hub opens at 7 tomorrow",
  body: "Effy's hub opens an hour late on Friday.",
  pictureKey: null,
  push: true,
  endsAt: null,
  audiences: [{ audience: "driver", filter: { deliveryToday: true }, destination: { kind: "today" } }],
};

function refused(body: unknown, code = "invalid_message"): void {
  try {
    parseDraft(body);
  } catch (err) {
    expect(isMessageError(err), String(err)).toBe(true);
    expect((err as { code: string }).code).toBe(code);
    return;
  }
  throw new Error("expected a refusal");
}

describe("parseDraft (112)", () => {
  it("accepts an announcement to drivers and trims the words", () => {
    const w = parseDraft({ ...announcement, title: "  Hub opens at 7  " });
    expect(w).toMatchObject({ kind: "announcement", title: "Hub opens at 7", push: true, endsAt: null });
    expect(w.audiences).toEqual([{ audience: "driver", filter: { deliveryToday: true }, destination: { kind: "today" } }]);
  });

  it("refuses an unknown field, a bad kind and words out of range", () => {
    refused({ ...announcement, colour: "red" });
    refused({ ...announcement, kind: "promotion" });
    refused({ ...announcement, title: "" });
    refused({ ...announcement, title: "x".repeat(61) });
    refused({ ...announcement, body: "x".repeat(501) });
    refused({ ...announcement, push: "yes" });
    refused(null);
  });

  it("refuses an audience the kind doesn't allow", () => {
    refused({ ...announcement, audiences: [{ audience: "customer", filter: {}, destination: { kind: "home" } }] });
    refused({ ...announcement, kind: "offer", audiences: [{ audience: "driver", filter: {}, destination: { kind: "today" } }] });
    refused({ ...announcement, audiences: [] });
    refused({
      ...announcement,
      audiences: [
        { audience: "driver", filter: {}, destination: { kind: "today" } },
        { audience: "driver", filter: {}, destination: { kind: "today" } },
      ],
    });
  });

  it("refuses an unknown filter and a destination the audience can't open", () => {
    refused({ ...announcement, audiences: [{ audience: "driver", filter: { inTheVan: true }, destination: { kind: "today" } }] }, "invalid_audience");
    refused({ ...announcement, audiences: [{ audience: "driver", filter: {}, destination: { kind: "sale" } }] }, "invalid_destination");
    refused({ ...announcement, audiences: [{ audience: "driver", filter: {}, destination: { kind: "run" } }] }, "invalid_destination");
  });

  it("an important message may go to all three audiences, each with its own destination", () => {
    const w = parseDraft({
      ...announcement,
      kind: "important",
      audiences: [
        { audience: "customer", filter: { postcodes: ["3101"] }, destination: { kind: "orders" } },
        { audience: "driver", filter: {}, destination: { kind: "account" } },
        { audience: "shop", filter: { managersOnly: true }, destination: { kind: "catalog" } },
      ],
    });
    expect(w.audiences.map((a) => a.audience)).toEqual(["customer", "driver", "shop"]);
  });

  it("a direct message is one person (or one shop's staff), always with a push", () => {
    expect(parseDraft({ ...announcement, kind: "direct", audiences: [{ audience: "customer", filter: { people: [ID] }, destination: { kind: "points" } }] }).kind).toBe("direct");
    expect(parseDraft({ ...announcement, kind: "direct", audiences: [{ audience: "shop", filter: { shops: [ID], managersOnly: true }, destination: { kind: "queue" } }] }).kind).toBe("direct");
    refused({ ...announcement, kind: "direct", audiences: [{ audience: "customer", filter: { people: [ID, ID2] }, destination: { kind: "home" } }] });
    refused({ ...announcement, kind: "direct", audiences: [{ audience: "customer", filter: {}, destination: { kind: "home" } }] });
    refused({ ...announcement, kind: "direct", audiences: [{ audience: "customer", filter: { people: [ID], hasPoints: true }, destination: { kind: "home" } }] });
    refused({ ...announcement, kind: "direct", push: false, audiences: [{ audience: "driver", filter: { people: [ID] }, destination: { kind: "today" } }] });
  });

  it("an end must be in the future; a picture must be a message picture", () => {
    refused({ ...announcement, endsAt: "2020-01-01T00:00:00Z" });
    refused({ ...announcement, endsAt: "tomorrow" });
    refused({ ...announcement, pictureKey: "products/x/a.webp" });
    expect(parseDraft({ ...announcement, pictureKey: `promotions/messages-${ID}/abc_DEF-1.webp` }).pictureKey).toBe(`promotions/messages-${ID}/abc_DEF-1.webp`);
  });
});

describe("parseDraft - email and the first name (115)", () => {
  const offer = {
    ...announcement,
    kind: "offer",
    title: "Berries are back",
    body: "Hi {first name}, 10% off berries from Effy.",
    audiences: [{ audience: "customer", filter: {}, destination: { kind: "sale" } }],
  };

  it("accepts email to customers and a fallback, and defaults to no email and \"there\"", () => {
    expect(parseDraft({ ...offer, email: true, nameFallback: " friend " })).toMatchObject({ email: true, nameFallback: "friend" });
    expect(parseDraft(offer)).toMatchObject({ email: false, nameFallback: "there" });
  });

  it("refuses the first name in the title, a bad fallback, and email to drivers", () => {
    refused({ ...offer, title: "Hi {first name}" });
    refused({ ...offer, nameFallback: "a{b}" });
    refused({ ...offer, nameFallback: "" });
    refused({ ...announcement, email: true });
    refused({ ...offer, email: "yes" });
  });
});

