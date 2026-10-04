import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 067 — who may read the review queue, and who may decide (FR-011, SC-010).
 *
 * Read = any active back-office staff, including csa. Decide = admin or manager. Both come from the
 * PLATFORM RECORD (`admin.staff`), never from the token's group claim.
 */

const shared = vi.hoisted(() => ({
  isActiveStaff: vi.fn(),
  hasStaffRole: vi.fn(),
}));
const service = vi.hoisted(() => ({
  queue: vi.fn(),
  marginNotSet: vi.fn(),
  item: vi.fn(),
  approve: vi.fn(),
  sendBack: vi.fn(),
  setMargin: vi.fn(),
}));

vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, ...shared };
});
vi.mock("./service", () => service);

import { handler as approveHandler } from "../functions/review-approve-v1-post";
import { handler as itemHandler } from "../functions/review-item-v1-get";
import { handler as listHandler } from "../functions/review-list-v1-get";
import { handler as notSetHandler } from "../functions/review-margin-not-set-v1-get";
import { handler as sendBackHandler } from "../functions/review-send-back-v1-post";
import { handler as marginHandler } from "../functions/product-margin-v1-post";

const ctx = { awsRequestId: "aws-1" } as never;

function event(sub: string | null, body?: unknown) {
  return {
    requestContext: {
      requestId: "req-1",
      authorizer: sub ? { jwt: { claims: { sub, "cognito:groups": "[admin]" } } } : undefined,
    },
    pathParameters: { productId: "11111111-1111-4111-8111-111111111111" },
    queryStringParameters: {},
    headers: {},
    body: body === undefined ? undefined : JSON.stringify(body),
  } as never;
}

const READ = [listHandler, notSetHandler, itemHandler];
const DECIDE = [approveHandler, sendBackHandler, marginHandler];

describe("067 — review authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const fn of Object.values(service)) fn.mockResolvedValue({});
  });

  it("refuses everything with no subject", async () => {
    for (const h of [...READ, ...DECIDE]) {
      expect((await h(event(null), ctx)).statusCode).toBe(401);
    }
    expect(shared.isActiveStaff).not.toHaveBeenCalled();
  });

  it("a csa can read the queue and an item", async () => {
    shared.isActiveStaff.mockResolvedValue(true);
    shared.hasStaffRole.mockResolvedValue(false);
    for (const h of READ) expect((await h(event("csa-sub"), ctx)).statusCode).toBe(200);
  });

  /** ⚠ SC-010. */
  it("⚠ a csa cannot approve, send back or set a margin", async () => {
    shared.isActiveStaff.mockResolvedValue(true);
    shared.hasStaffRole.mockResolvedValue(false);
    for (const h of DECIDE) expect((await h(event("csa-sub", { version: "v" }), ctx)).statusCode).toBe(403);
    expect(service.approve).not.toHaveBeenCalled();
    expect(service.sendBack).not.toHaveBeenCalled();
    expect(service.setMargin).not.toHaveBeenCalled();
  });

  it("an admin or manager can decide, and the role asked for is admin/manager", async () => {
    shared.hasStaffRole.mockResolvedValue(true);
    for (const h of DECIDE) expect((await h(event("admin-sub", { version: "v" }), ctx)).statusCode).toBe(200);
    for (const call of shared.hasStaffRole.mock.calls) expect(call[1]).toEqual(["admin", "manager"]);
  });

  /** ⚠ The token above CLAIMS the admin group. The record says otherwise, and the record wins. */
  it("⚠ decides from the staff record, not the token's group claim", async () => {
    shared.isActiveStaff.mockResolvedValue(false);
    shared.hasStaffRole.mockResolvedValue(false);
    for (const h of [...READ, ...DECIDE]) {
      expect((await h(event("disabled-sub", { version: "v" }), ctx)).statusCode).toBe(403);
    }
  });

  it("fails closed when the authorization check itself errors", async () => {
    shared.isActiveStaff.mockRejectedValue(new Error("db down"));
    shared.hasStaffRole.mockRejectedValue(new Error("db down"));
    for (const h of [...READ, ...DECIDE]) {
      expect((await h(event("admin-sub", { version: "v" }), ctx)).statusCode).toBe(503);
    }
  });

  it("the decision is attributed to the authenticated subject, never to the body", async () => {
    shared.hasStaffRole.mockResolvedValue(true);
    await approveHandler(event("admin-sub", { version: "v", actorSub: "someone-else" }), ctx);
    expect(service.approve.mock.calls[0]![2]).toBe("admin-sub");
  });
});
