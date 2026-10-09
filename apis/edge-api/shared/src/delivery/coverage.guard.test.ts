import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 076 — three things about coverage that are true only while nobody adds a second copy, and that
 * every behavioural test would go on passing without.
 *
 *   P10  the refusal sentence is written in ONE file (FR-022, SC-004);
 *   P11  a customer contract carries the answer and nothing about why (FR-023, SC-010);
 *   P12  coverage is decided in ONE place (FR-020).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../..");
const rel = (file: string) => relative(repo, file);

function files(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "build" || name === ".next" || name === "dist" || name === ".serverless" || name === "generated") continue;
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) files(path, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(path);
  }
  return out;
}

const edgeApi = resolve(repo, "apis/edge-api");
const services = readdirSync(edgeApi).filter((d) => {
  try {
    return statSync(resolve(edgeApi, d, "src")).isDirectory();
  } catch {
    return false;
  }
});

describe("P10 — the refusal is written once", () => {
  /** The one file that may hold it, and its mirror in the app (held to it by coverage-words.test.ts). */
  const HOLDERS = new Set([
    "packages/shared-types/src/delivery.ts",
    "apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/core/delivery/CoverageWords.kt",
  ]);
  /** About EMAIL the platform cannot deliver, not parcels. */
  const NOT_ABOUT_DELIVERY = new Set(["apps/customer-web/app/(account)/account/EmailDeliveryNotice.tsx"]);

  // Any wording of "we do not / cannot deliver to this address", straight or curly apostrophe.
  const REFUSAL = /(?:don['’]t|do not|can['’]t|cannot|can not)\s+deliver\s+(?:to\s+)?(?:this|that|your)\s+address|deliver to this address yet/i;

  const sources = [
    ...services.flatMap((s) => files(resolve(edgeApi, s, "src"), [".ts"])),
    ...files(resolve(repo, "apps/customer-web/app"), [".ts", ".tsx"]),
    ...files(resolve(repo, "apps/customer-web/lib"), [".ts", ".tsx"]),
    ...files(resolve(repo, "apps/customer-mobile/shared/src/commonMain"), [".kt"]),
    ...files(resolve(repo, "packages/shared-types/src"), [".ts"]),
  ].filter((f) => !/\.test\.tsx?$/.test(f));

  it("is looking at the customer surfaces and every service", () => {
    expect(sources.length).toBeGreaterThan(600);
    expect(sources.some((f) => rel(f) === "apps/customer-web/app/checkout/CheckoutFlow.tsx")).toBe(true);
    expect(sources.some((f) => rel(f).endsWith("checkout/presentation/CheckoutScreen.kt"))).toBe(true);
  });

  it("no file but the one that holds it writes a refusal of its own", () => {
    const strays = sources
      .filter((f) => !HOLDERS.has(rel(f)) && !NOT_ABOUT_DELIVERY.has(rel(f)))
      .filter((f) => {
        // Comments may talk about the sentence; only code may not restate it.
        const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*).*$/gm, "");
        return REFUSAL.test(code);
      })
      .map(rel);
    expect(strays, `these write their own "can't deliver" wording — import COVERAGE_REFUSAL_SENTENCE (or CoverageWords.REFUSAL) instead:\n  ${strays.join("\n  ")}`).toEqual([]);
  });

  it("the holders do hold it", () => {
    for (const h of HOLDERS) expect(readFileSync(resolve(repo, h), "utf8")).toMatch(/Sorry, we can't deliver to this address\./);
  });
});

describe("P11 — a customer is told who delivers, never why", () => {
  const types = resolve(repo, "packages/shared-types/src");
  const CUSTOMER_CONTRACTS = ["delivery.ts", "address.ts", "checkout.ts", "storefront.ts", "customer.ts", "customer-contract.ts", "customer-commerce-contract.ts", "order.ts", "cart.ts"];
  /** Staff-only words that must never sit beside a coverage answer on a customer contract. */
  const STAFF_ONLY = /\b(groupId|groupName|coverageGroup|distanceKm|distanceSource|hubLatitude|hubLongitude|hubDistance\w*|coverageReason|exclusionReason|courierExcluded)\b/;

  it.each(CUSTOMER_CONTRACTS)("%s declares no group, distance, hub or reason field", (file) => {
    const code = readFileSync(resolve(types, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(STAFF_ONLY.exec(code)?.[0], `${file} would tell a customer something only staff may know`).toBeUndefined();
  });

  it("and the staff contract is where those fields live — the guard is not vacuous", () => {
    expect(readFileSync(resolve(types, "delivery-admin.ts"), "utf8")).toMatch(STAFF_ONLY);
  });
});

describe("P12 — coverage is decided in one place", () => {
  /**
   * Files that may name the list's table, each for a reason that is not "decide coverage again":
   */
  const MAY_READ_THE_LIST: Record<string, string> = {
    "apis/edge-api/admin/src/delivery/coverage.repository.ts": "maintains the list (add, remove, group, distance)",
    "apis/edge-api/admin/src/delivery/repository.ts": "recalculates distances when the hub moves",
    "apis/edge-api/shared/src/lib/load-migrations.ts": "TEST SUPPORT only — the fixture statement that lists a postcode for services forbidden to name its distance column",
    "apis/edge-api/fleet/src/planner/sql.ts": "which GROUP a delivery belongs to, for driver clearances (082: a clearance is a function and a group, or everywhere)",
    "apis/edge-api/fleet/src/dispatch/sql.ts": "which GROUP a delivery belongs to, for the dispatch board",
    "apis/edge-api/shared/src/delivery/readiness.ts": "the go-live checklist (083): HOW MANY postcodes are listed and how far the nearest and farthest are, to ask the fee plan whether it can price them — never whether an address is covered",
    "apis/edge-api/fleet/src/dispatch/windows.ts": "which GROUP a parcel's address is in, on dispatch's day view (082) — a name to read, never a coverage decision",
  };

  const readers = services
    .flatMap((s) => files(resolve(edgeApi, s, "src"), [".ts"]))
    .filter((f) => !/\.test\.ts$/.test(f))
    .filter((f) => /\bdelivery_zone_postcode\b/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*|--).*$/gm, "")))
    .map(rel)
    .sort();

  it("only the allowed files read the list's table", () => {
    const extra = readers.filter((f) => !(f in MAY_READ_THE_LIST));
    expect(extra, `these read public.delivery_zone_postcode directly — ask coverageForPostcode() instead, or add the file to MAY_READ_THE_LIST with the reason it is not deciding coverage:\n  ${extra.join("\n  ")}`).toEqual([]);
  });

  it("every allowance is still used — none outlives its reason", () => {
    const unused = Object.keys(MAY_READ_THE_LIST).filter((f) => !readers.includes(f));
    expect(unused).toEqual([]);
  });

  it("the answer itself is read from the one function, by the one wrapper", () => {
    const callers = services
      .flatMap((s) => files(resolve(edgeApi, s, "src"), [".ts"]))
      .filter((f) => !/\.test\.ts$/.test(f))
      .filter((f) => /coverage_for_postcode\(/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*).*$/gm, "")))
      .map(rel)
      .sort();
    // `coverage.ts` is the wrapper. The address book calls the function inside its own row read so
    // the answer arrives with the row it describes, in one statement.
    expect(callers).toEqual(["apis/edge-api/customer/src/addresses/model.ts", "apis/edge-api/shared/src/delivery/coverage.ts"]);
  });
});
