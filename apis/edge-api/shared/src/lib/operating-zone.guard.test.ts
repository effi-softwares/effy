import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EDGE_API_DIR, INFRA_DEV_DIR, listStacks } from "./serverless-stacks";

/**
 * One value decides Effy's clock: `operating_timezone` in the env's tfvars. A zone written anywhere else stays on
 * Melbourne when that value changes, which passes every test and is out by hours only in the environment that set it.
 */
const REPO = resolve(EDGE_API_DIR, "../..");
const ROOTS = ["apis/edge-api", "apps/back-office/src", "apps/shop-web/src", "apps/customer-web", "packages/web-kit/src"];
const SKIP_DIR = new Set(["node_modules", "dist", ".next", ".serverless", ".esbuild", "out", "coverage"]);
const SOURCE = /\.tsx?$/;
const EXEMPT = /\.(test|spec)\.tsx?$|\/test-clock\.ts$|\/__tests__\/|\/fixtures\.ts$/;
const ZONE = "(?:Africa|America|Asia|Atlantic|Australia|Europe|Indian|Pacific)/";
const WRITTEN_ZONE = new RegExp(`AT TIME ZONE '${ZONE}|timeZone: "${ZONE}|(?:const \\w*(?:TZ|TIMEZONE) =|\\?\\?) "${ZONE}`);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIR.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return SOURCE.test(name) && !EXEMPT.test(path) ? [path] : [];
  });
}

describe("one operating zone", () => {
  it("no source names a zone itself", () => {
    const offenders = ROOTS.flatMap((root) => sources(join(REPO, root))).filter((f) =>
      WRITTEN_ZONE.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("every stack bakes it into the bundle at build, with no default", () => {
    for (const stack of listStacks()) {
      expect(stack.yml, stack.name).toContain(`process.env.OPERATING_TZ: '"\${ssm:/effy/\${sls:stage}/operating_tz}"'`);
    }
  });

  it("every web build takes the same variable", () => {
    expect(readFileSync(join(INFRA_DEV_DIR, "amplify-consoles.tf"), "utf8")).toMatch(/OPERATING_TZ\s+= var\.operating_timezone/);
    expect(readFileSync(join(INFRA_DEV_DIR, "amplify-customer-web.tf"), "utf8")).toMatch(/OPERATING_TZ\s+= var\.operating_timezone/);
    for (const app of ["apps/back-office/vite.config.ts", "apps/shop-web/vite.config.ts", "apps/customer-web/next.config.ts"]) {
      expect(readFileSync(join(REPO, app), "utf8"), app).toContain("OPERATING_TZ");
    }
  });
});
