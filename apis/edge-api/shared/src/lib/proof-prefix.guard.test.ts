import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PROOF_MEDIA_PREFIX } from "./proof-prefix";

/**
 * `PROOF_MEDIA_PREFIX` and the media.tf lifecycle rule must agree, or the platform archives nothing, or
 * archives the product catalogue (and pays a retrieval fee on every page view). Nothing else checks.
 */
describe("proof prefix ↔ the S3 lifecycle rule", () => {
  const mediaTf = (() => {
    let cur = __dirname;
    for (let i = 0; i < 12; i += 1) {
      const candidate = resolve(cur, "infra", "envs", "dev", "media.tf");
      if (existsSync(candidate)) return readFileSync(candidate, "utf8");
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    throw new Error("could not locate infra/envs/dev/media.tf");
  })();

  /** The lifecycle block only, so prose cannot satisfy an assertion. */
  const lifecycle = (() => {
    const start = mediaTf.indexOf('resource "aws_s3_bucket_lifecycle_configuration"');
    expect(start, "no lifecycle configuration in media.tf — proof would never be archived").toBeGreaterThan(-1);
    return mediaTf.slice(start);
  })();

  it("filters on exactly the prefix the presign writes under", () => {
    expect(lifecycle).toContain(`prefix = "${PROOF_MEDIA_PREFIX}/"`);
  });

  /** An empty prefix filter would apply the transition to the whole bucket. */
  it("is never unscoped", () => {
    expect(lifecycle).toMatch(/filter\s*\{[^}]*prefix\s*=\s*"[^"]+"/);
    expect(lifecycle).not.toMatch(/prefix\s*=\s*""/);
  });

  /** GLACIER_IR only: a colder tier needs RestoreObject, forking every read path. */
  it("archives to Glacier Instant Retrieval, not to a tier that needs restoring", () => {
    expect(lifecycle).toContain('storage_class = "GLACIER_IR"');
    expect(lifecycle).not.toMatch(/storage_class\s*=\s*"GLACIER"/);
    expect(lifecycle).not.toMatch(/storage_class\s*=\s*"DEEP_ARCHIVE"/);
  });

  /** No expiration: proof is kept (and on a versioned bucket an expiration would only write a delete marker). */
  it("never expires proof", () => {
    expect(lifecycle).not.toMatch(/^\s*expiration\s*\{/m);
    expect(lifecycle).not.toMatch(/noncurrent_version_expiration/);
  });

  it("cleans up abandoned uploads, which are billable and unreadable", () => {
    expect(lifecycle).toContain("abort_incomplete_multipart_upload");
  });
});
