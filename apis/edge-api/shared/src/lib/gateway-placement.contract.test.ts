import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { EDGE_API_DIR, functionsOf, httpRoutes, INFRA_DEV_DIR, listStacks, type Gateway } from "./serverless-stacks.js";

/**
 * ⚠ WHICH GATEWAY A SERVICE IS ON IS A SECURITY BOUNDARY, NOT A DEPLOYMENT DETAIL (075).
 *
 * There are two gateways. The STAFF gateway carries exactly one authorizer — the back-office
 * pool's — and the SHARED gateway carries none for back-office. So a customer, shop or driver
 * token has nothing on the staff gateway that could accept it, and a staff token has nothing on
 * the shared one. That holds whatever any single route's configuration says.
 *
 * It holds only while every stack is on the right gateway and names the right authorizer. Both are
 * one line of YAML each, in thirteen files, and a wrong one deploys cleanly: a back-office stack
 * left on the shared gateway fails only at the move's last step, and a shop route pointed at a
 * staff parameter resolves, deploys and 401s every shop in the country.
 *
 * Placement rule and what to do with a new service: docs/api/path-assignment.md.
 */

/** ⚠ THE PLACEMENT TABLE. A new stack must be added to exactly one line — that is the point. */
const PLACEMENT: Record<string, Gateway | null> = {
  // customers and the public
  storefront: "shared",
  commerce: "shared",
  customer: "shared",
  // shops
  shop: "shared",
  inventory: "shared",
  // drivers
  driver: "shared",
  // a provider callback, not an audience
  notifications: "shared",
  // back-office
  admin: "staff",
  fleet: "staff",
  orders: "staff",
  catalog: "staff",
  "inventory-staff": "staff",
  // no route at all
  auth: null,
  live: null,
};

const stacks = listStacks();
const BACK_OFFICE = "/staff/authorizer/back-office_id";

describe("gateway placement — every stack is on the gateway its audience uses", () => {
  it("every stack is placed, and every placement is a stack that exists", () => {
    const unplaced = stacks.map((s) => s.name).filter((n) => !(n in PLACEMENT));
    expect(unplaced, `not in the placement table — decide its gateway (docs/api/path-assignment.md), then add it here:\n  ${unplaced.join("\n  ")}`).toEqual([]);
    const gone = Object.keys(PLACEMENT).filter((n) => !stacks.some((s) => s.name === n));
    expect(gone, `placed but no such stack exists any more: ${gone.join(", ")}`).toEqual([]);
  });

  it.each(stacks.map((s) => [s.name, s] as const))("%s attaches where the table says", (name, stack) => {
    expect(stack.gateway, `${stack.dir}/${stack.file} reads the wrong gateway's http_api_id parameter`).toBe(PLACEMENT[name]);
  });
});

describe("⚠ the audiences stay apart — per gateway, not only per route", () => {
  it("no route on the SHARED gateway names a back-office authorizer", () => {
    const bad = stacks
      .filter((s) => s.gateway === "shared")
      .flatMap((s) => httpRoutes(s).filter((r) => r.authorizerParam?.includes("back-office")).map((r) => `${s.name}: ${r.method} ${r.path}`));
    expect(bad, `a staff sign-in would be accepted on the shared gateway:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("every authenticated route on the STAFF gateway names its back-office authorizer, and nothing else", () => {
    const bad = stacks
      .filter((s) => s.gateway === "staff")
      .flatMap((s) => httpRoutes(s).filter((r) => r.authorizerParam !== null && r.authorizerParam !== BACK_OFFICE).map((r) => `${s.name}: ${r.method} ${r.path} → ${r.authorizerParam}`));
    expect(bad, `a staff-gateway route reads an authorizer that is not the staff gateway's own:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("the only public routes on the STAFF gateway are each stack's own health probes", () => {
    const open = stacks
      .filter((s) => s.gateway === "staff")
      .flatMap((s) => httpRoutes(s).filter((r) => r.authorizerParam === null && !new RegExp(`^/${s.name}/(healthz|readyz)$`).test(r.path)).map((r) => `${s.name}: ${r.method} ${r.path}`));
    expect(open, `reachable by anyone, with no sign-in, on the staff gateway:\n  ${open.join("\n  ")}`).toEqual([]);
  });

  it("no stack reads an AUTHORIZER from the other gateway's prefix", () => {
    // Authorizers only. A gateway's id may be read by a stack that is not on it — the hourly usage
    // check in `admin` counts both — but an authorizer id is only ever meaningful on its own gateway.
    for (const s of stacks) {
      if (s.gateway === "staff") expect(s.yml, `${s.dir}/${s.file} is on the staff gateway but reads an /edge/ authorizer`).not.toMatch(/\/effy\/\$\{sls:stage\}\/edge\/authorizer\//);
      if (s.gateway === "shared") expect(s.yml, `${s.dir}/${s.file} is on the shared gateway but reads a /staff/ authorizer`).not.toMatch(/\/effy\/\$\{sls:stage\}\/staff\/authorizer\//);
    }
  });

  it("the staff gateway declares exactly one authorizer", () => {
    const tf = readFileSync(resolve(INFRA_DEV_DIR, "staff-gateway.tf"), "utf8");
    const authorizers = [...tf.matchAll(/^resource "aws_apigatewayv2_authorizer" "(\w+)"/gm)].map((m) => m[1]);
    expect(authorizers).toEqual(["staff_back_office"]);
    expect(tf).not.toMatch(/for_each\s*=\s*local\.edge_pools/);
  });

  it("Terraform publishes every parameter the stacks read from either gateway", () => {
    const tf = ["edge-gateway.tf", "edge-domain.tf", "staff-gateway.tf"].map((f) => readFileSync(resolve(INFRA_DEV_DIR, f), "utf8")).join("\n");
    const read = new Set(stacks.flatMap((s) => [...s.yml.matchAll(/\$\{ssm:\/effy\/\$\{sls:stage\}(\/(?:edge|staff)\/[a-z_/-]+)\}/g)].map((m) => m[1]!)));
    expect(read.size).toBeGreaterThanOrEqual(6);
    for (const param of read) {
      const literal = `"/effy/\${var.env}${param}"`;
      const viaLoop = /^\/edge\/authorizer\/(customer|shop|driver)_id$/.test(param) && tf.includes('"/effy/${var.env}/edge/authorizer/${each.key}_id"');
      expect(tf.includes(literal) || viaLoop, `a stack reads ${param}, which Terraform does not publish`).toBe(true);
    }
  });
});

describe("inventory — one service, two stacks, nothing declared twice and nothing left out", () => {
  const shop = stacks.find((s) => s.name === "inventory")!;
  const staff = stacks.find((s) => s.name === "inventory-staff")!;
  const HEALTH = new Set(["src/functions/healthz-get.handler", "src/functions/readyz-get.handler"]);

  it("both stacks come from the one directory", () => {
    expect(shop.dir).toBe("inventory");
    expect(staff.dir).toBe("inventory");
  });

  it("every handler in src/functions is declared by exactly one stack (health probes by both)", () => {
    const onDisk = readdirSync(resolve(EDGE_API_DIR, "inventory/src/functions"))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => `src/functions/${f.replace(/\.ts$/, "")}.handler`);
    const inShop = functionsOf(shop).map((f) => f.handler);
    const inStaff = functionsOf(staff).map((f) => f.handler);
    for (const h of onDisk) {
      const n = Number(inShop.includes(h)) + Number(inStaff.includes(h));
      expect(n, `${h} is declared by ${n} of the two inventory stacks`).toBe(HEALTH.has(h) ? 2 : 1);
    }
    for (const h of [...inShop, ...inStaff]) expect(onDisk, `${h} is declared but no such file exists`).toContain(h);
  });

  it("the back-office paths are in the staff stack, and nothing else is", () => {
    for (const r of httpRoutes(shop)) expect(r.path, "a back-office stock route is in the shop stack").not.toContain("/inventory/v1/admin/");
    const staffPaths = httpRoutes(staff).map((r) => r.path).filter((p) => !p.startsWith("/inventory-staff/"));
    expect(staffPaths.length).toBe(6);
    for (const p of staffPaths) expect(p.startsWith("/inventory/v1/admin/"), `${p} is in the staff stack but is not a back-office path`).toBe(true);
  });

  it("no scheduled or queue-driven function was lost in the split — they belong to the shop stack", () => {
    expect(functionsOf(staff).filter((f) => f.routes.length === 0).map((f) => f.key)).toEqual([]);
  });
});

describe("the move is over — no environment carries the machinery for it (FR-025)", () => {
  // 075 moved back-office in stages, driven by a `staff_gateway_cutover` variable and five temporary
  // forwarding routes on the shared gateway. Both were removed once dev had moved: a new environment
  // is created in the finished state and has nothing to step through. If a staged move is ever
  // needed again, how it was done is in specs/075-staff-gateway/ (research R5, quickstart).
  const infraEnvs = resolve(INFRA_DEV_DIR, "..");

  it("no Terraform or tfvars file mentions the cutover variable or declares a forwarding route", () => {
    const hits: string[] = [];
    for (const env of readdirSync(infraEnvs)) {
      let files: string[];
      try {
        files = readdirSync(resolve(infraEnvs, env)).filter((f) => f.endsWith(".tf") || f.endsWith(".tfvars"));
      } catch {
        continue;
      }
      for (const f of files) {
        const text = readFileSync(resolve(infraEnvs, env, f), "utf8");
        if (/staff_gateway_cutover|staff_forward/.test(text)) hits.push(`${env}/${f}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the shared gateway creates no back-office authorizer, and the back-office website calls the staff address", () => {
    const edge = readFileSync(resolve(INFRA_DEV_DIR, "edge-gateway.tf"), "utf8");
    expect(edge).toMatch(/shared_pools = \{ for k, v in local\.edge_pools : k => v if k != "back-office" \}/);
    expect([...edge.matchAll(/for_each = local\.shared_pools\n/g)].length).toBe(2);
    const consoles = readFileSync(resolve(INFRA_DEV_DIR, "amplify-consoles.tf"), "utf8");
    expect(consoles).toMatch(/back_office_api_base_url = local\.staff_api_url/);
  });
});
