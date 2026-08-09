import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

import { publish, readLayout, revert, writeDraft } from "./repository";
import { isLayoutError } from "./types";

/** A fake pg client whose query() returns queued results in order; records every call for assertions. */
function fakeClient(results: unknown[]) {
  const calls: { text: string; params: unknown[] }[] = [];
  const client = {
    query: vi.fn((text: string, params: unknown[] = []) => {
      calls.push({ text, params });
      return Promise.resolve(results.shift() ?? { rows: [], rowCount: 0 });
    }),
  };
  return { client, calls };
}

const ROW = {
  draft: [],
  published: [],
  revision: "3",
  published_at: null,
  published_by: null,
  updated_at: new Date("2026-08-09T00:00:00Z"),
  updated_by: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [ROW], rowCount: 1 });
});

describe("reading", () => {
  it("returns null when there is no singleton row, rather than fabricating one", async () => {
    // ⚠ The service turns this into a loud 503. Fabricating an empty layout here would give the
    // operator a composer that appears to work and silently discards everything they do.
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await readLayout()).toBeNull();
  });

  /**
   * ⚠ `bigint` ARRIVES FROM node-postgres AS A STRING, because it does not fit a JS number in
   * general. Left as-is, `revision` would travel to the client as `"3"`, come back as `"3"`, and the
   * `WHERE revision = $n` comparison would still work — so the defect would hide until something
   * compared or incremented it in JavaScript.
   */
  it("converts the revision from the string node-postgres returns", async () => {
    const layout = await readLayout();
    expect(layout?.revision).toBe(3);
    expect(typeof layout?.revision).toBe("number");
  });
});

describe("optimistic concurrency (FR-017)", () => {
  /**
   * ⚠ TWO OPERATORS EDITING THE HOME PAGE IS ORDINARY; ONE SILENTLY DISCARDING THE OTHER'S WORK IS
   * NOT. The write is conditional on the revision the client last read, so the loser affects zero
   * rows — and that is a DISTINGUISHABLE outcome the operator can act on ("reload and reapply"),
   * which a generic "save failed" does not support.
   */
  for (const [name, run] of [
    ["writeDraft", () => writeDraft([], 3, "sub-1")],
    ["publish", () => publish(3, "sub-1")],
    ["revert", () => revert(3, "sub-1")],
  ] as const) {
    it(`${name} refuses a stale revision with a conflict, not a generic failure`, async () => {
      withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<void>) => {
        // Zero rows affected — someone else wrote since this client read.
        const { client } = fakeClient([{ rows: [], rowCount: 0 }]);
        return fn(client);
      });

      const err = await run().catch((e: unknown) => e);
      expect(isLayoutError(err)).toBe(true);
      expect(err).toMatchObject({ status: 409, code: "layout_revision_conflict" });
    });

    it(`${name} writes conditionally on the revision it was given`, async () => {
      let seen: { text: string; params: unknown[] }[] = [];
      withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<void>) => {
        const { client, calls } = fakeClient([{ rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }]);
        seen = calls;
        return fn(client);
      });

      await run();
      const update = seen[0]!;
      // ⚠ The condition lives in SQL, not in a read-then-write in the service. Postgres serialises
      // the two UPDATEs on the row, so there is no window between a check and a write for a
      // concurrent publish to slip through.
      expect(update.text).toMatch(/WHERE singleton AND revision = \$/);
      expect(update.params).toContain(3);
      expect(update.text).toMatch(/revision = revision \+ 1/);
    });
  }
});

describe("auditing (FR-015)", () => {
  /**
   * ⚠ IN THE SAME TRANSACTION AS THE CHANGE. An audit row written afterwards is an audit row that
   * can be missing — and the one time it goes missing is the one time someone needs it.
   */
  for (const [name, run, action] of [
    ["writeDraft", () => writeDraft([], 3, "sub-1"), "home_layout.draft_save"],
    ["publish", () => publish(3, "sub-1"), "home_layout.publish"],
    ["revert", () => revert(3, "sub-1"), "home_layout.revert"],
  ] as const) {
    it(`${name} writes its audit row inside the same transaction`, async () => {
      let seen: { text: string; params: unknown[] }[] = [];
      withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<void>) => {
        const { client, calls } = fakeClient([{ rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }]);
        seen = calls;
        return fn(client);
      });

      await run();
      expect(seen).toHaveLength(2);
      expect(seen[1]!.text).toMatch(/INSERT INTO admin\.audit_log/);
      expect(seen[1]!.params).toContain(action);
      expect(seen[1]!.params).toContain("sub-1");
    });
  }

  /**
   * ⚠ THE BLOCK COUNT AND TYPES ARE AUDITED, NOT THE BODIES. An audit row per save carrying the whole
   * page would make the log unreadable and store operator copy twice. What an auditor needs is who
   * changed the shape of the page, and when.
   */
  it("records what changed about the shape of the page, not the page itself", async () => {
    let seen: { text: string; params: unknown[] }[] = [];
    withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<void>) => {
      const { client, calls } = fakeClient([{ rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }]);
      seen = calls;
      return fn(client);
    });

    await writeDraft(
      [{ id: "a", type: "app_promo", props: { headline: "secret operator copy" } }],
      3,
      "sub-1",
    );
    const detail = String(seen[1]!.params.at(-1));
    expect(JSON.parse(detail)).toEqual({ blockCount: 1, types: ["app_promo"] });
    expect(detail).not.toContain("secret operator copy");
  });
});

describe("publishing copies inside the statement", () => {
  /**
   * ⚠ `published = draft` IS COPIED IN SQL rather than round-tripped through the service. Reading the
   * draft, validating it and writing it back would publish whatever the service READ, which is not
   * necessarily what is in the column by the time the write lands. Copying inside the statement,
   * under the revision condition, makes "publish exactly the draft that was validated" true by
   * construction rather than by timing.
   */
  it("never sends a body back to the database on publish", async () => {
    let seen: { text: string; params: unknown[] }[] = [];
    withTransaction.mockImplementation(async (fn: (c: unknown) => Promise<void>) => {
      const { client, calls } = fakeClient([{ rows: [], rowCount: 1 }, { rows: [], rowCount: 1 }]);
      seen = calls;
      return fn(client);
    });

    await publish(3, "sub-1");
    expect(seen[0]!.text).toMatch(/SET published = draft/);
    expect(seen[0]!.params).toEqual(["sub-1", 3]);
  });
});
