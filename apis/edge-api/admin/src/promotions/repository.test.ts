import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
const withTransaction = vi.hoisted(() => vi.fn());
vi.mock("@effy/edge-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@effy/edge-shared")>()),
  query,
  withTransaction,
}));

import { readOrderPolicy } from "./repository";
import { isPromoError } from "./types";

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isPromoError(e) ? e.code : "other";
  }
}

/** A fake pg client whose query() returns queued results in order; records every call for assertions. */
function fakeClient(results: unknown[]) {
  const calls: { text: string; params: unknown[] }[] = [];
  const q = vi.fn((text: string, params: unknown[] = []) => {
    calls.push({ text, params });
    return Promise.resolve(results.shift() ?? { rows: [], rowCount: 0 });
  });
  return { client: { query: q }, calls };
}
const auditCall = (calls: { text: string; params: unknown[] }[]) =>
  calls.find((c) => c.text.includes("admin.audit_log"));

beforeEach(() => {
  query.mockReset();
  withTransaction.mockReset();
});

describe("readOrderPolicy", () => {
  it("refuses loudly if the singleton row is missing rather than inventing defaults", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await codeOf(readOrderPolicy())).toBe("order_policy_missing");
  });
});
