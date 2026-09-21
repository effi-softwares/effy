import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./repository", () => ({
  DropNotFoundError: class DropNotFoundError extends Error {},
  recordProof: vi.fn(async () => ({ proof: {}, orderComplete: false, replayed: false })),
  recordFailure: vi.fn(async () => ({ failureId: "f1", failedAt: "", replayed: false })),
}));
vi.mock("@effy/edge-shared", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@effy/edge-shared");
  return { ...actual, presignUpload: vi.fn(async () => ({ uploadUrl: "u", storageKey: "proof/d/1.jpg" })) };
});

import { PROOF_MEDIA_PREFIX, presignUpload } from "@effy/edge-shared";

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

  /**
   * ⚠ FR-003. `ProofMethod` still carries `"code"` on the wire because the method is coming — but no
   * delivery code exists anywhere on this platform, so accepting one would compare a value to itself:
   * a gate that LOOKS enforced and checks nothing. It is refused by NAME, with a reason a driver can
   * read, and never reaches the repository.
   */
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
      // A required field a client can satisfy with a space is not required.
      await expect(
        submitProof("d1", "drv1", "sub1", { method: "photo", mediaKey: "   ", changeId: change } as never),
      ).rejects.toMatchObject({ field: "mediaKey" });
    });
  });

  /**
   * ⚠ FR-002. An unattended drop is the case most likely to become a dispute, so it is the one that
   * MUST carry a photograph. The schema permits contactless-without-media (it is the one legitimate
   * no-media proof); the RULE that it needs a photo lives here.
   */
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
  /**
   * ⚠ THE PREFIX IS INFRASTRUCTURE. The Terraform lifecycle rule that archives proof filters on this
   * exact value; an object written anywhere else is never archived and sits in STANDARD for ever,
   * with nothing reporting it.
   */
  it("writes under the shared proof prefix, not a local literal", async () => {
    await presignProof("d1", { contentType: "image/jpeg", fileSize: 1000, changeId: change });
    expect(presignUpload).toHaveBeenCalledWith(PROOF_MEDIA_PREFIX, "d1", "image/jpeg", 1000);
  });

  it("requires a changeId", async () => {
    await expect(
      presignProof("d1", { contentType: "image/jpeg", fileSize: 1 } as never),
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
