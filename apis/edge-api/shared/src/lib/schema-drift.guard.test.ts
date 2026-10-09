import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * NO SOURCE NAMES A COLUMN A MIGRATION HAS DROPPED.
 *
 * ── The defect this exists to make impossible ───────────────────────────────────────────────────
 *
 * 051's payment profile selected `public.customer.display_name`. That column had been dropped and
 * replaced by `given_name` + `family_name`. The query compiled, every unit test passed — the fakes
 * return strings and never touch a database — and it failed only against the real one, after
 * deploy, as `column "display_name" does not exist`. It broke EVERY checkout: not just saving a
 * card, but paying at all.
 *
 * With raw SQL and no ORM nothing else can catch this before a statement runs, so it is worth one
 * cheap static check. (It guarded the Go backend until 070; this is the same check over the
 * services that replaced it — and over every other service, which never had it.)
 *
 * ── Scope, and why it is drawn exactly here ─────────────────────────────────────────────────────
 *
 *  1. Only DROPs in a migration's **Up** half count. A Down undoes an ADD, so the columns it drops
 *     are live ones, and honouring those would ban most of the schema.
 *  2. ⚠ A column can be dropped and LATER RE-ADDED, so only the LAST action on a name counts.
 *  3. It is NAME-scoped, not table-scoped: a name dropped from one table and live on another reads
 *     as live. That is the deliberate trade for a check with no schema engine in it.
 *
 * It proves a column is not referenced AFTER being dropped. It does NOT prove every referenced
 * column exists — the container suites, which run the real migrations, are what prove that.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../..");
const edgeApi = resolve(repoRoot, "apis/edge-api");
const migrations = resolve(repoRoot, "db/migrations");

/** Replay every Up half in order; return the names whose LAST action was a DROP. */
function columnsLeftDropped(): string[] {
  const live = new Map<string, boolean>();
  const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
  if (files.length === 0) throw new Error("no migrations found — this guard would pass vacuously");
  for (const f of files) {
    let up = readFileSync(join(migrations, f), "utf8");
    const down = /^\s*--\s*\+goose\s+Down\s*$/m.exec(up);
    if (down) up = up.slice(0, down.index);
    // The statements are found in file order so a drop-then-add inside ONE migration ends live.
    const actions: { at: number; name: string; alive: boolean }[] = [];
    for (const table of up.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[a-z_."]+\s*\(([\s\S]*?)\n\);/gi)) {
      for (const def of table[1]!.matchAll(/^\s{2,}([a-z_][a-z0-9_]*)\s+[a-z]/gm)) actions.push({ at: table.index, name: def[1]!, alive: true });
    }
    for (const m of up.matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) actions.push({ at: m.index, name: m[1]!.toLowerCase(), alive: true });
    for (const m of up.matchAll(/DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) actions.push({ at: m.index, name: m[1]!.toLowerCase(), alive: false });
    for (const a of actions.sort((x, y) => x.at - y.at)) live.set(a.name, a.alive);
  }
  return [...live].filter(([, alive]) => !alive).map(([name]) => name).sort();
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry.startsWith(".")) return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(entry) && !/\.test\.ts$/.test(entry) ? [full] : [];
  });
}

/**
 * The lines with comments removed.
 *
 * ⚠ IT DELIBERATELY DOES NOT TRY TO FIND "the SQL lines". SQL here is written as multi-line
 * template strings, and the line that names a column usually carries no quote character at all.
 * Comments are stripped because the explanation around a fix names the dropped column on purpose.
 */
function codeLines(body: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (inBlock) {
      if (line.includes("*/")) inBlock = false;
      continue;
    }
    if (t.startsWith("/*")) {
      if (!line.includes("*/")) inBlock = true;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("--")) continue;
    // A trailing comment, in either language. `://` is a URL, not a comment.
    out.push(line.replace(/(^|[^:])\/\/.*$/, "$1").replace(/--.*$/, ""));
  }
  return out;
}

/**
 * Names that are dropped as COLUMNS and still legitimately appear in source as something else.
 * Each entry says what the other thing is; an entry with no reason is a hole in the guard.
 */
const NOT_A_COLUMN_HERE: Record<string, string> = {
  // The driver service still calls these two by their old names in its OWN row shape: they are
  // SELECT aliases over the columns that replaced them (`hv.registration_plate AS vehicle_plate`,
  // `hv.body_type AS vehicle_type`), not reads of the dropped columns.
  vehicle_plate: "a SELECT alias in edge-api/driver over registration_plate",
  vehicle_type: "a SELECT alias in edge-api/driver over body_type",
};

/**
 * Names whose LAST migration action was a drop from ONE table while the same name stays LIVE on
 * another. The check is name-scoped (see 3 above), so without this entry every read of the live
 * column would be reported.
 *
 * ⚠ Each entry trades the guard for that name. It says where the name is still live and where it
 * was dropped — and the dropped side must be held by something else, named here.
 */
const LIVE_ON_ANOTHER_TABLE: Record<string, string> = {
  // 083 dropped the per-package split from order_package_delivery and shop_fulfillment. The ORDER's
  // own fee column is the one every service reads. Held by: the container suites (real migrations),
  // and commerce's store, which writes no fee on a package (077).
  delivery_fee_amount: 'live on public."order"; dropped from order_package_delivery / shop_fulfillment (083)',
  // 083 dropped driver_zone_capability.method. Held by: fleet/src/driver-method.guard.test.ts, which
  // fails any reader of a clearance's method.
  method: "live on public.order_package_delivery; dropped from driver_zone_capability (083)",
};

describe("no source references a column a migration dropped", () => {
  const dropped = columnsLeftDropped();
  const services = readdirSync(edgeApi).filter((d) => {
    try {
      return statSync(join(edgeApi, d, "src")).isDirectory();
    } catch {
      return false;
    }
  });
  const files = services.flatMap((s) => sourceFiles(join(edgeApi, s, "src")));

  it("is looking at real migrations and real source", () => {
    expect(dropped.length, "no column has ever been dropped? the parser is not reading the migrations").toBeGreaterThan(0);
    // The founding case must be in the list, or the guard cannot catch its own founding bug.
    expect(dropped).toContain("display_name");
    expect(services).toEqual(expect.arrayContaining(["shared", "storefront", "commerce", "orders", "shop", "customer", "admin"]));
    expect(files.length).toBeGreaterThan(300);
  });

  it("strips comments in both languages, and keeps code", () => {
    expect(codeLines("a display_name // why\n// display_name\n/* display_name */\n -- display_name\nSELECT x -- display_name\n'https://x'")).toEqual([
      "a display_name ", "SELECT x ", "'https://x'",
    ]);
  });

  it("every exemption is still needed, and is still only an alias", () => {
    for (const name of Object.keys(NOT_A_COLUMN_HERE)) {
      expect(dropped, `${name} is exempted but is no longer a dropped column — remove the exemption`).toContain(name);
      const uses = files.flatMap((f) => codeLines(readFileSync(f, "utf8")).filter((l) => new RegExp(`\\b${name}\\b`).test(l)));
      expect(uses.length, `${name} is exempted but nothing uses it`).toBeGreaterThan(0);
      // Never read FROM a table: no `x.name` and no bare `name` in a select list except after AS.
      for (const l of uses.filter((u) => /\bAS\b|SELECT|FROM|WHERE/i.test(u))) expect(l, `${name} must only ever follow AS`).toMatch(new RegExp(`\\bAS\\s+${name}\\b`));
    }
  });

  it("a name exempted as live elsewhere really was dropped somewhere, and is still read", () => {
    for (const name of Object.keys(LIVE_ON_ANOTHER_TABLE)) {
      expect(dropped, `${name} is exempted but its last action is no longer a drop — remove the exemption`).toContain(name);
      const used = files.some((f) => codeLines(readFileSync(f, "utf8")).some((l) => new RegExp(`\\b${name}\\b`).test(l)));
      expect(used, `${name} is exempted but nothing reads it`).toBe(true);
    }
    // ⚠ The founding case can never be put here.
    expect(Object.keys(LIVE_ON_ANOTHER_TABLE)).not.toContain("display_name");
  });

  it("every dropped column is absent from every service", () => {
    const offences: string[] = [];
    for (const column of dropped) {
      if (column in NOT_A_COLUMN_HERE || column in LIVE_ON_ANOTHER_TABLE) continue;
      const pattern = new RegExp(`\\b${column}\\b`);
      for (const file of files) {
        for (const line of codeLines(readFileSync(file, "utf8"))) {
          if (pattern.test(line)) offences.push(`${relative(repoRoot, file)} references "${column}"\n      ${line.trim().slice(0, 140)}`);
        }
      }
    }
    expect(
      offences,
      `A query naming a column that does not exist typechecks, passes every fake-backed test, and ` +
        `fails against the real database:\n\n  ${offences.join("\n  ")}\n`,
    ).toEqual([]);
  });
});
