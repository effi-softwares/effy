import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the S3 SDK + presigner so no network/credentials are touched. presignUpload's job here is
// content-type + size validation and key shaping; the signing itself is the SDK's.
const getSignedUrl = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {},
  PutObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

import { presignUpload } from "./media";
import { isProductError } from "./types";

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "no-throw";
  } catch (e) {
    return isProductError(e) ? e.kind : "other";
  }
}

describe("media.presignUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.S3_MEDIA_BUCKET = "effy-dev-product-media";
    getSignedUrl.mockResolvedValue("https://s3/put-signed");
  });

  it("rejects a non-image content type", async () => {
    expect(await kindOf(presignUpload("prod-1", "application/pdf", 1000))).toBe("validation");
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects an oversize file", async () => {
    expect(await kindOf(presignUpload("prod-1", "image/jpeg", 50 * 1024 * 1024))).toBe("validation");
  });

  it("rejects a zero / non-numeric size", async () => {
    expect(await kindOf(presignUpload("prod-1", "image/jpeg", 0))).toBe("validation");
    expect(await kindOf(presignUpload("prod-1", "image/jpeg", "big"))).toBe("validation");
  });

  it("mints an upload url + a product-scoped key for a valid jpeg", async () => {
    const out = await presignUpload("prod-1", "image/jpeg", 1024);
    expect(out.uploadUrl).toBe("https://s3/put-signed");
    expect(out.storageKey).toMatch(/^products\/prod-1\/[a-f0-9]+\.jpg$/);
    expect(getSignedUrl).toHaveBeenCalledOnce();
  });
});
