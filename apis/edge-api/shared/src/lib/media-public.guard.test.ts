import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { PUBLIC_MEDIA_PREFIXES } from "./media-public";
import { PROOF_MEDIA_PREFIX } from "./proof-prefix";
import { EDGE_API_DIR, INFRA_DEV_DIR } from "./serverless-stacks";

/**
 * ⚠ WHAT THE CDN MAY SERVE IS STATED TWICE, AND THIS IS WHAT HOLDS THE TWO TOGETHER (086 FR-015).
 *
 * `PUBLIC_MEDIA_PREFIXES` decides which keys the services give a public address. The bucket policy
 * in `infra/envs/dev/media.tf`, built from `local.public_media_prefixes`, decides which keys the CDN
 * can actually read. If they disagree, either pictures the storefront names answer 403 (code only),
 * or objects nobody meant to publish become fetchable (Terraform only). The bucket also holds courier
 * labels — a customer's name and address — and proof-of-delivery photos.
 */
const mediaTf = readFileSync(resolve(INFRA_DEV_DIR, "media.tf"), "utf8");

/** The value of `public_media_prefixes = [ … ]` in media.tf. */
function terraformPublicPrefixes(): string[] {
  const m = /public_media_prefixes\s*=\s*\[([^\]]*)\]/.exec(mediaTf);
  expect(m, "media.tf has no local.public_media_prefixes").not.toBeNull();
  return [...(m?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1] ?? "");
}

/** One resource's block, by its exact header. */
function block(header: string): string {
  const start = mediaTf.indexOf(header);
  expect(start, `media.tf has no ${header}`).toBeGreaterThan(-1);
  const next = mediaTf.indexOf("\nresource ", start + header.length);
  const nextData = mediaTf.indexOf("\ndata ", start + header.length);
  const ends = [next, nextData].filter((i) => i > -1);
  return mediaTf.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe("the public picture set ↔ the bucket policy (086)", () => {
  it("Terraform and the code name the same prefixes", () => {
    expect(terraformPublicPrefixes()).toEqual([...PUBLIC_MEDIA_PREFIXES]);
  });

  it("never includes delivery proof or courier labels", () => {
    const set = new Set<string>(PUBLIC_MEDIA_PREFIXES);
    expect(set.has(PROOF_MEDIA_PREFIX)).toBe(false);
    expect(set.has("courier-label")).toBe(false);
    expect(terraformPublicPrefixes()).not.toContain(PROOF_MEDIA_PREFIX);
    expect(terraformPublicPrefixes()).not.toContain("courier-label");
  });

  it("the policy is built from that list, grants GetObject only, and never ListBucket", () => {
    const policy = block('data "aws_iam_policy_document" "product_media"');
    expect(policy).toMatch(/for p in local\.public_media_prefixes/);
    expect(policy).toMatch(/actions\s*=\s*\["s3:GetObject"\]/);
    // A missing key must answer 403 like a refused one, and nothing may be listed (FR-016, FR-017).
    expect(policy).not.toMatch(/ListBucket/);
    expect(policy).toMatch(/AWS:SourceArn/);
  });

  it("the bucket keeps its public-access block fully on", () => {
    const pab = block('resource "aws_s3_bucket_public_access_block" "product_media"');
    for (const flag of ["block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets"]) {
      expect(pab).toMatch(new RegExp(`${flag}\\s*=\\s*true`));
    }
  });

  it("only original uploads notify the worker — never its own copies, never proof or labels", () => {
    const notification = block('resource "aws_s3_bucket_notification" "product_media"');
    const prefixes = [...notification.matchAll(/filter_prefix\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
    expect(prefixes.sort()).toEqual(["products/", "promotions/"]);
  });
});

/** Every non-test TypeScript source under a service's `src/`. */
function sources(service: string): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push({ file: full.slice(EDGE_API_DIR.length + 1), text: readFileSync(full, "utf8") });
    }
  };
  walk(resolve(EDGE_API_DIR, service, "src"));
  return out;
}

describe("who may build a public address (086 FR-014)", () => {
  /**
   * ⚠ The services that read labels and proof never call `publicImageUrl` on a line that names one.
   * The function would refuse the key anyway; this keeps anyone from trying.
   */
  it.each(["orders", "shop", "driver", "fleet"])("%s gives no label or proof a public address", (service) => {
    const offences = sources(service).flatMap(({ file, text }) =>
      text
        .split("\n")
        .map((line, i) => ({ line, at: `${file}:${i + 1}` }))
        .filter(({ line }) => /publicImageUrl\(/.test(line) && /label|proof/i.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(offences).toEqual([]);
  });

  it("only the shopper services build public addresses", () => {
    const services = readdirSync(EDGE_API_DIR).filter(
      (d) => !["shared", "storefront", "commerce", "node_modules"].includes(d) && statSync(resolve(EDGE_API_DIR, d)).isDirectory(),
    );
    const offences = services.flatMap((s) => {
      try {
        return sources(s).filter(({ text }) => /\bpublicImageUrl\b/.test(text)).map(({ file }) => file);
      } catch {
        return []; // a directory with no src/
      }
    });
    expect(offences).toEqual([]);
  });
});
