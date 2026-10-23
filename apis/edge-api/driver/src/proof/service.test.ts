import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./repository", () => ({
  DropNotFoundError: class DropNotFoundError extends Error {},
  recordProof: vi.fn(async () => ({ proof: {}, orderComplete: false, replayed: false })),
  recordFailure: vi.fn(async () => ({ failureId: "f1", failedAt: "", replayed: false })),
}));
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return {
    ...actual,
    presignUpload: vi.fn(async () => ({ uploadUrl: "u", storageKey: "proof/d/1.jpg" })),
    // The round-opening read; empty by default (an open round).
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  };
});

import { PROOF_MEDIA_PREFIX, presignUpload, query } from "@effy/edge-shared";

import { recordFailure, recordProof } from "./repository";
import { ProofValidationError, presignProof, submitFailure, submitProof } from "./service";

const change = "11111111-1111-1111-1111-111111111111";
const ok = { method: "photo", mediaKey: "proof/d/1.jpg", changeId: change } as never;

beforeEach(() => vi.clearAllMocks());

describe("submitProof — what a proof MAY be", () => {
  it("accepts a photo with media", async () => {
    await submitProof("d1", "drv1", "sub1", ok);
    expect(recordProof).toHaveBeenCalledOnce();
  });

  /** `code` is refused by name: no delivery code exists. */
  it("REFUSES `code`, names the field, and does not reach the database", async () => {
    await expect(
      submitProof("d1", "drv1", "sub1", { method: "code", code: "123456", changeId: change } as never),
    ).rejects.toMatchObject({ field: "method" });
    expect(recordProof).not.toHaveBeenCalled();
  });

  it("refuses a method that does not exist at all", async () => {
    await expect(
      submitProof("d1", "drv1", "sub1", { method: "telepathy", changeId: change } as never),
    ).rejects.toBeInstanceOf(ProofValidationError);
  });

  describe("⚠ FR-006 — never delivered against proof that failed to upload", () => {
    it("refuses a photo with no mediaKey", async () => {
      await expect(
        submitProof("d1", "drv1", "sub1", { method: "photo", changeId: change } as never),
      ).rejects.toMatchObject({ field: "mediaKey" });
      expect(recordProof).not.toHaveBeenCalled();
    });

    it("refuses a signature with no mediaKey", async () => {
      await expect(
        submitProof("d1", "drv1", "sub1", { method: "signature", changeId: change } as never),
      ).rejects.toMatchObject({ field: "mediaKey" });
    });

    it("treats a whitespace-only mediaKey as absent", async () => {
      // A required field satisfied by a space is not satisfied.
      await expect(
        submitProof("d1", "drv1", "sub1", { method: "photo", mediaKey: "   ", changeId: change } as never),
      ).rejects.toMatchObject({ field: "mediaKey" });
    });
  });

  /** An unattended drop must carry a photograph. */
  it("REQUIRES a photo for a contactless delivery", async () => {
    await expect(
      submitProof("d1", "drv1", "sub1", { method: "contactless", changeId: change } as never),
    ).rejects.toMatchObject({ field: "mediaKey" });
  });

  it("accepts contactless WITH a photo", async () => {
    await submitProof("d1", "drv1", "sub1", {
      method: "contactless",
      mediaKey: "proof/d/2.jpg",
      changeId: change,
    } as never);
    expect(recordProof).toHaveBeenCalledOnce();
  });

  it("requires a changeId, or a retry could apply twice", async () => {
    await expect(
      submitProof("d1", "drv1", "sub1", { method: "photo", mediaKey: "k" } as never),
    ).rejects.toMatchObject({ field: "changeId" });
  });

  it("passes the driver's own subject through for attribution (FR-029)", async () => {
    await submitProof("d1", "drv1", "sub-abc", ok);
    expect(recordProof).toHaveBeenCalledWith(expect.objectContaining({ driverSub: "sub-abc" }));
  });
});

describe("presignProof", () => {
  /** The Terraform lifecycle rule archives this exact prefix. */
  it("writes under the shared proof prefix, not a local literal", async () => {
    await presignProof("d1", "drv1", { contentType: "image/jpeg", fileSize: 1000, changeId: change });
    expect(presignUpload).toHaveBeenCalledWith(PROOF_MEDIA_PREFIX, "d1", "image/jpeg", 1000);
  });

  // No upload slot for a delivery that cannot have happened yet.
  it("refuses, and mints nothing, while the drop's round has not opened", async () => {
    const opensAt = new Date("2026-10-08T05:15:00Z");
    vi.mocked(query).mockResolvedValueOnce({ rows: [{ opens_at: opensAt, closed: true }], rowCount: 1 } as never);

    await expect(
      presignProof("d1", "drv1", { contentType: "image/jpeg", fileSize: 1000, changeId: change }),
    ).rejects.toMatchObject({ name: "RoundNotOpenError", opensAt: opensAt.toISOString() });
    expect(presignUpload).not.toHaveBeenCalled();
  });

  // Scoped to the caller, so another driver's drop reveals nothing.
  it("asks about the round only as this driver", async () => {
    await presignProof("d1", "drv1", { contentType: "image/jpeg", fileSize: 1000, changeId: change });
    expect(vi.mocked(query).mock.calls[0]![1]).toEqual(["d1", "drv1"]);
  });

  it("requires a changeId", async () => {
    await expect(
      presignProof("d1", "drv1", { contentType: "image/jpeg", fileSize: 1 } as never),
    ).rejects.toMatchObject({ field: "changeId" });
  });
});

describe("submitFailure — US2", () => {
  it("accepts every reason in the closed set", async () => {
    for (const reason of ["nobody_home", "wrong_address", "customer_refused", "access_blocked"]) {
      await submitFailure("d1", "drv1", { reason, changeId: change } as never);
    }
    expect(recordFailure).toHaveBeenCalledTimes(4);
  });

  it("refuses a reason outside the set", async () => {
    await expect(
      submitFailure("d1", "drv1", { reason: "raining", changeId: change } as never),
    ).rejects.toMatchObject({ field: "reason" });
  });

  it("⚠ FR-010 — refuses `other` with no note", async () => {
    await expect(
      submitFailure("d1", "drv1", { reason: "other", changeId: change } as never),
    ).rejects.toMatchObject({ field: "note" });
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("⚠ refuses `other` with a whitespace-only note", async () => {
    await expect(
      submitFailure("d1", "drv1", { reason: "other", note: "  ", changeId: change } as never),
    ).rejects.toMatchObject({ field: "note" });
  });

  it("accepts `other` with a real note", async () => {
    await submitFailure("d1", "drv1", {
      reason: "other",
      note: "gate locked",
      changeId: change,
    } as never);
    expect(recordFailure).toHaveBeenCalledOnce();
  });
});
