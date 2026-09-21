import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PROOF_MEDIA_PREFIX } from "./proof-prefix";

/**
 * ⚠ THE CONSTANT AND THE TERRAFORM RULE MUST AGREE, AND NOTHING ELSE CHECKS THAT (064).
 *
 * `PROOF_MEDIA_PREFIX` decides where `edge-api/driver` writes proof. A lifecycle rule in
 * `infra/envs/dev/media.tf` decides what gets archived. They are in different languages, in different
 * directories, deployed by different commands — and if they disagree the platform either:
 *
 *   · archives NOTHING, so proof sits in STANDARD storage for ever and the cost claim in the plan is
 *     simply false; or
 *   · archives the PRODUCT CATALOGUE, where every storefront image still renders perfectly and
 *     silently bills a retrieval fee on every page view.
 *
 * Neither raises an error anywhere. Both are invisible until a bill or a legal request arrives. This
 * test is the only thing standing between the two files.
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

  /** The lifecycle block only, so prose elsewhere in the file cannot satisfy an assertion. */
  const lifecycle = (() => {
    const start = mediaTf.indexOf('resource "aws_s3_bucket_lifecycle_configuration"');
    expect(start, "no lifecycle configuration in media.tf — proof would never be archived").toBeGreaterThan(-1);
    return mediaTf.slice(start);
  })();

  it("filters on exactly the prefix the presign writes under", () => {
    expect(lifecycle).toContain(`prefix = "${PROOF_MEDIA_PREFIX}/"`);
  });

  /**
   * ⚠ THE CATASTROPHIC CASE. An empty or absent prefix filter applies the transition to the WHOLE
   * bucket — `products/` and `promotions/` included.
   */
  it("is never unscoped", () => {
    expect(lifecycle).toMatch(/filter\s*\{[^}]*prefix\s*=\s*"[^"]+"/);
    expect(lifecycle).not.toMatch(/prefix\s*=\s*""/);
  });

  /**
   * ⚠ GLACIER_IR ONLY. A colder tier needs an asynchronous RestoreObject, which would fork every read
   * path into "recent" and "archived" behaviour — for about $0.11/month (research R5). If someone
   * "optimises" this later, the cost lands in code nobody budgeted for.
   */
  it("archives to Glacier Instant Retrieval, not to a tier that needs restoring", () => {
    expect(lifecycle).toContain('storage_class = "GLACIER_IR"');
    expect(lifecycle).not.toMatch(/storage_class\s*=\s*"GLACIER"/);
    expect(lifecycle).not.toMatch(/storage_class\s*=\s*"DEEP_ARCHIVE"/);
  });

  /**
   * ⚠ NO EXPIRATION, EVER. Proof is evidence and the operator's direction is that it is kept. An
   * `expiration` block here would also be silently useless on this versioned bucket — it writes a
   * delete marker and the object persists — so its presence would mean someone believed something
   * untrue about both the policy AND the mechanism.
   */
  it("never expires proof", () => {
    expect(lifecycle).not.toMatch(/^\s*expiration\s*\{/m);
    expect(lifecycle).not.toMatch(/noncurrent_version_expiration/);
  });

  it("cleans up abandoned uploads, which are billable and unreadable", () => {
    expect(lifecycle).toContain("abort_incomplete_multipart_upload");
  });
});
