import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  audiencesFor,
  isEveryone,
  MESSAGE_EVENTS,
  MESSAGE_KIND_VALUES,
  MESSAGE_KINDS,
  MESSAGE_STATUSES,
  messageFiling,
  messageNamesEffy,
  peopleWords,
} from "./messages";
import { findPolicy } from "./notification-categories";

const here = dirname(fileURLToPath(import.meta.url));
const migrations = resolve(here, "../../../db/migrations");

/** The CHECK list the newest migration defining a constraint gives in its Up section. */
function checkList(constraint: string): string[] {
  const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort().reverse();
  for (const file of files) {
    const up = readFileSync(resolve(migrations, file), "utf8").split(/--\s*\+goose Down/)[0] ?? "";
    const m = new RegExp(`CONSTRAINT\\s+${constraint}\\s+CHECK\\s*\\([^\\[]*ARRAY\\[([^\\]]*)\\]`).exec(up);
    if (m) return [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
  }
  throw new Error(`no migration defines ${constraint}`);
}

describe("112 - message kinds, declared once", () => {
  it("files every kind under a category its audience has (111's policy)", () => {
    for (const k of MESSAGE_KINDS) {
      for (const [audience, filing] of Object.entries(k.filing)) {
        const policy = findPolicy(audience as "customer" | "driver" | "shop", filing!.category);
        expect(policy, `${k.kind} → ${audience}/${filing!.category}`).not.toBeNull();
        expect(policy!.marketing, `${k.kind} marketing matches its category`).toBe(k.marketing);
      }
    }
  });

  it("offers and news reach customers only, and are the only marketing kinds", () => {
    expect(audiencesFor("offer")).toEqual(["customer"]);
    expect(audiencesFor("news")).toEqual(["customer"]);
    expect(MESSAGE_KINDS.filter((k) => k.marketing).map((k) => k.kind)).toEqual(["offer", "news"]);
  });

  it("announcements are for drivers and shops, never customers", () => {
    expect(audiencesFor("announcement")).toEqual(["driver", "shop"]);
    expect(messageFiling("announcement", "customer")).toBeNull();
  });

  it("important is important for every audience; direct reaches all three", () => {
    for (const a of ["customer", "driver", "shop"] as const) {
      expect(messageFiling("important", a)).toEqual({ category: "important", importance: "important" });
    }
    expect(audiencesFor("direct")).toEqual(["customer", "driver", "shop"]);
    expect(messageFiling("direct", "customer")?.category).toBe("support");
  });

  it("agrees with the migration's CHECK lists", () => {
    expect(checkList("message_kind_check")).toEqual([...MESSAGE_KIND_VALUES]);
    expect(checkList("message_status_check")).toEqual([...MESSAGE_STATUSES]);
    expect(checkList("message_event_event_check")).toEqual([...MESSAGE_EVENTS]);
  });

  it("lists the three message notification types in the notification type CHECK", () => {
    const types = checkList("notification_type_check");
    expect(types).toEqual(expect.arrayContaining(["customer_message", "driver_message", "shop_message"]));
  });
});

describe("112 - helpers", () => {
  it("knows whether words name Effy", () => {
    expect(messageNamesEffy("20% off fruit", "From Effy, this weekend")).toBe(true);
    expect(messageNamesEffy("EFFY deals", "x")).toBe(true);
    expect(messageNamesEffy("20% off fruit", "This weekend only")).toBe(false);
  });

  it("says people in words", () => {
    expect(peopleWords("customer", 1204)).toBe("1,204 customers");
    expect(peopleWords("driver", 1)).toBe("1 driver");
    expect(peopleWords(null, 2)).toBe("2 people");
  });

  it("treats an empty filter as everyone", () => {
    expect(isEveryone({})).toBe(true);
    expect(isEveryone({ hasPoints: true })).toBe(false);
  });
});
