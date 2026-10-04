import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ THE DEPLOYMENT CONTRACT for the catalog service (067).
 *
 * A unit test that supplies its own configuration can never notice that the configuration does not
 * exist (035: four env vars `serverless.yml` never declared, no email ever sent, one hundred green
 * tests). So this mocks nothing. It reads the ACTUAL serverless.yml.
 *
 * And it pins the one thing this service exists to keep true: EVERY decision route is behind the
 * BACK-OFFICE authorizer. A review route behind the shop authorizer is a shop approving itself.
 */

const yaml = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "..", "serverless.yml"), "utf8");

function functions(): { name: string; block: string }[] {
  const section = yaml.slice(yaml.indexOf("\nfunctions:"), yaml.indexOf("\nresources:"));
  const starts: { name: string; at: number }[] = [];
  const re = /\n {2}([a-zA-Z][a-zA-Z0-9]*):\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) starts.push({ name: m[1]!, at: m.index });
  return starts.map((s, i) => ({
    name: s.name,
    block: section.slice(s.at, i + 1 < starts.length ? starts[i + 1]!.at : section.length),
  }));
}

describe("catalog deployment contract — serverless.yml declares what the service needs", () => {
  it("found the functions (this suite would otherwise pass vacuously)", () => {
    expect(functions().length).toBeGreaterThanOrEqual(8);
  });

  it("declares every env var the service reads", () => {
    for (const key of ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_SECRET_ARN", "S3_MEDIA_BUCKET"]) {
      expect(yaml, `${key} is read at runtime but not declared`).toContain(`${key}:`);
    }
  });

  it("may read product images and nothing more", () => {
    expect(yaml).toContain("s3:GetObject");
    expect(yaml).not.toMatch(/s3:(PutObject|DeleteObject|\*)/);
  });

  /** ⚠ The reason this service is not `edge-shop`. */
  it("⚠ puts every HTTP route except healthz behind the BACK-OFFICE authorizer, and none behind the shop's", () => {
    const http = functions().filter((f) => f.block.includes("httpApi:") && f.name !== "healthz");
    expect(http.length).toBeGreaterThanOrEqual(6);
    for (const f of http) {
      expect(f.block, `${f.name} has no back-office authorizer`).toContain("/edge/authorizer/back-office_id}");
    }
    expect(yaml).not.toContain("/edge/authorizer/shop_id}");
    expect(yaml).not.toContain("/edge/authorizer/customer_id}");
    expect(yaml).not.toContain("/edge/authorizer/driver_id}");
  });

  it("keeps every route under /catalog/", () => {
    const paths = [...yaml.matchAll(/\n\s+path: (\S+)/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThanOrEqual(7);
    for (const p of paths) expect(p.startsWith("/catalog/")).toBe(true);
  });

  it("every handler it declares exists", () => {
    for (const m of yaml.matchAll(/handler: (src\/functions\/[a-z0-9-]+)\.handler/g)) {
      const file = resolve(dirname(fileURLToPath(import.meta.url)), "..", `${m[1]}.ts`);
      expect(() => readFileSync(file), `${m[1]}.ts is declared but missing`).not.toThrow();
    }
  });

  it("runs the queue-age measure on a schedule", () => {
    const f = functions().find((x) => x.name === "reviewQueueAge");
    expect(f?.block).toContain("schedule:");
  });
});
