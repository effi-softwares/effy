import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import type { TourDef } from "./define";

/**
 * The checks every console's tours must pass (106 FR-001/FR-016/FR-019, 107 FR-003/FR-004/FR-007, SC-001/SC-003),
 * shared so both consoles run the same ones. NODE-ONLY: imported by tests, never by a page.
 */

// ── The words: tours.ts against the spec's Tour Inventory ─────────────────────────────────────────────────────

interface SpecStep {
  title: string;
  text: string;
  shownWhen: string;
}

interface SpecTour {
  code: string;
  /** Role marks named in the heading's brackets, e.g. "(needs a record; Admin or manager)". */
  headingMarks: string[];
  steps: SpecStep[];
}

export function readTourInventory(specPath: string): Map<string, SpecTour> {
  const spec = readFileSync(specPath, "utf8");
  const body = spec.slice(spec.indexOf("## Tour Inventory"));
  const out = new Map<string, SpecTour>();
  for (const section of body.split(/^### /m).slice(1)) {
    const head = /^([A-Z]+) - [^\n(]*(?:\(([^)]*)\))?/.exec(section);
    if (!head) continue;
    const steps = section
      .split("\n")
      .filter((line) => /^\| \d+ \|/.test(line))
      .map((line) => {
        const cells = line
          .trim()
          .slice(1, -1)
          .split("|")
          .map((c) => c.trim());
        return { title: cells[2]!, text: cells[3]!, shownWhen: cells[4] ?? "" };
      });
    const headingMarks = (head[2] ?? "").split(";").map((m) => m.trim()).filter(Boolean);
    out.set(head[1]!, { code: head[1]!, headingMarks, steps });
  }
  return out;
}

const sameRoles = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
  JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());

/**
 * Every difference between the tours and the spec: missing or extra tours, step count, order, title, text, the
 * "Shown when" column, and - through `roleMarks` - each step's and each tour's roles. Empty when they agree.
 */
export function checkToursAgainstSpec({
  specPath,
  codeToKey,
  tours,
  roleMarks,
}: {
  specPath: string;
  codeToKey: Readonly<Record<string, string>>;
  tours: readonly TourDef[];
  /** A "Shown when" (or heading) mark to the role keys it means. */
  roleMarks: Readonly<Record<string, readonly string[]>>;
}): string[] {
  const inventory = readTourInventory(specPath);
  const problems: string[] = [];
  if (inventory.size === 0) return ["the spec has no Tour Inventory"];

  for (const code of inventory.keys()) {
    if (!codeToKey[code]) problems.push(`spec tour ${code} has no key in codeToKey`);
    else if (!tours.some((t) => t.key === codeToKey[code])) problems.push(`spec tour ${code} (${codeToKey[code]}) is not defined`);
  }
  for (const tour of tours) {
    const code = Object.keys(codeToKey).find((c) => codeToKey[c] === tour.key);
    const spec = code ? inventory.get(code) : undefined;
    if (!spec) {
      problems.push(`${tour.key} is not in the spec's inventory`);
      continue;
    }
    const tourMark = spec.headingMarks.find((m) => roleMarks[m]);
    if (!sameRoles(tour.roles, tourMark ? roleMarks[tourMark] : undefined)) {
      problems.push(`${tour.key}: tour roles ${JSON.stringify(tour.roles ?? [])} but the spec says "${tourMark ?? "everyone"}"`);
    }
    if (tour.steps.length !== spec.steps.length) {
      problems.push(`${tour.key}: ${tour.steps.length} steps, the spec has ${spec.steps.length}`);
    }
    spec.steps.forEach((want, i) => {
      const got = tour.steps[i];
      if (!got) return;
      const at = `${tour.key} step ${i + 1}`;
      if (got.title !== want.title) problems.push(`${at}: title "${got.title}" ≠ "${want.title}"`);
      if (got.text !== want.text) problems.push(`${at}: text differs from the spec`);
      if ((got.shownWhen ?? "") !== want.shownWhen) problems.push(`${at}: shownWhen "${got.shownWhen ?? ""}" ≠ "${want.shownWhen}"`);
      const mark = Object.keys(roleMarks).find((m) => want.shownWhen === m || want.shownWhen.startsWith(`${m},`));
      if (!sameRoles(got.roles, mark ? roleMarks[mark] : undefined)) {
        problems.push(`${at}: roles ${JSON.stringify(got.roles ?? [])} but the spec says "${want.shownWhen || "everyone"}"`);
      }
    });
  }
  return problems;
}

/** SC-003: the steps a role would be shown, by role alone, that the spec does not show that role. */
export function checkRoleFiltering({
  specPath,
  codeToKey,
  tours,
  roleMarks,
  role,
}: {
  specPath: string;
  codeToKey: Readonly<Record<string, string>>;
  tours: readonly TourDef[];
  roleMarks: Readonly<Record<string, readonly string[]>>;
  role: string;
}): string[] {
  const inventory = readTourInventory(specPath);
  const wrong: string[] = [];
  const allows = (roles: readonly string[] | undefined) => !roles || roles.length === 0 || roles.includes(role);
  for (const tour of tours) {
    const code = Object.keys(codeToKey).find((c) => codeToKey[c] === tour.key);
    const spec = code ? inventory.get(code) : undefined;
    if (!spec) continue;
    const tourMark = spec.headingMarks.find((m) => roleMarks[m]);
    const specTourAllows = allows(tourMark ? roleMarks[tourMark] : undefined);
    if (allows(tour.roles) !== specTourAllows) wrong.push(`${tour.key}: the tour ${specTourAllows ? "must" : "must not"} be ${role}'s`);
    if (!specTourAllows) continue;
    tour.steps.forEach((step, i) => {
      const want = spec.steps[i];
      if (!want) return;
      const mark = Object.keys(roleMarks).find((m) => want.shownWhen === m || want.shownWhen.startsWith(`${m},`));
      const specAllows = allows(mark ? roleMarks[mark] : undefined);
      if (allows(step.roles) !== specAllows) wrong.push(`${tour.key} step ${i + 1} "${step.title}": ${specAllows ? "hidden from" : "shown to"} ${role}`);
    });
  }
  return wrong;
}

// ── Coverage: every routed page has a tour, every step points at something ─────────────────────────────────

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".") || entry === "__tests__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full;
  }
}

const read = (f: string) => readFileSync(f, "utf8");

export interface TourCoverageInput {
  /** The app's `src`. */
  srcDir: string;
  /** web-kit's `src` (shared parts carry keys too). */
  kitDir: string;
  /** Route files that are not pages (sign-in, the root). */
  ignoreRouteFiles: readonly string[];
  /** Route paths/ids that are layouts, not pages. */
  ignoreRoutePaths: readonly string[];
  /** The sidebar's nav file (its `key:` values make `nav.<key>`). */
  navFile: string;
  /** The app's own tours file, excluded from the "is the key written somewhere" scan. */
  toursDir: string;
  tours: readonly TourDef[];
}

export interface TourCoverage {
  pages: { path: string; files: string[]; keys: string[] }[];
  routesWithoutTour: string[];
  unknownKeys: string[];
  orphanTours: string[];
  missingTargets: string[];
  pageLevelMisses: string[];
}

export function tourCoverage(input: TourCoverageInput): TourCoverage {
  const { srcDir, kitDir, navFile, toursDir, tours } = input;
  const routesDir = join(srcDir, "routes");
  const appFiles = [...sourceFiles(srcDir)].filter((f) => !f.startsWith(toursDir));
  const allText = [...appFiles, ...sourceFiles(kitDir)].map(read).join("\n");

  const resolveModule = (spec: string, from: string): string | null => {
    const base = spec.startsWith("@/") ? join(srcDir, spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
    if (!base) return null;
    for (const c of [`${base}.tsx`, `${base}.ts`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c)) return c;
    return null;
  };
  const appImports = (file: string): Map<string, string> => {
    const out = new Map<string, string>();
    for (const m of read(file).matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
      const target = resolveModule(m[2]!, file);
      if (!target) continue;
      for (const raw of m[1]!.split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
        if (name) out.set(name, target);
      }
    }
    return out;
  };

  const tourKeysIn = (text: string): string[] => {
    const keys: string[] = [];
    for (const m of text.matchAll(/useTourPage\(\s*([\s\S]*?),\s*\{/g)) {
      const arg = m[1]!;
      // Literals that are a result, not the left of a comparison (`tab === "x" ? "a" : "b"`).
      for (const lit of arg.matchAll(/(?<![=!]==\s*)"([a-z0-9-]+)"/g)) keys.push(lit[1]!);
      for (const tpl of arg.matchAll(/`([a-z0-9-]+)-\$\{/g)) keys.push(`${tpl[1]}-*`);
    }
    return keys;
  };
  const keyMatches = (pattern: string, key: string) => (pattern.endsWith("-*") ? key.startsWith(pattern.slice(0, -1)) : pattern === key);

  const pages: TourCoverage["pages"] = [];
  for (const f of readdirSync(routesDir)) {
    if (!f.endsWith(".tsx") || input.ignoreRouteFiles.includes(f)) continue;
    const file = join(routesDir, f);
    const text = read(file);
    const imports = appImports(file);
    for (const def of text.matchAll(/createRoute\(\{([\s\S]*?)\n\}\)/g)) {
      const body = def[1]!;
      const path = /path:\s*"([^"]*)"/.exec(body)?.[1] ?? /id:\s*"([^"]*)"/.exec(body)?.[1] ?? "?";
      if (input.ignoreRoutePaths.includes(path)) continue;
      const component = /component:\s*(?:\(\)\s*=>\s*<|function\s+)?(\w+)/.exec(body)?.[1];
      if (!component) continue;
      const reached = new Set<string>();
      const visit = (name: string) => {
        const target = imports.get(name);
        if (target) {
          reached.add(target);
          for (const t of appImports(target).values()) reached.add(t);
          return;
        }
        // A component written in the route file: what it renders.
        const at = text.indexOf(`function ${name}`);
        if (at < 0) return;
        for (const jsx of text.slice(at, at + 2000).matchAll(/<([A-Z]\w*)/g)) {
          if (jsx[1] !== name && imports.has(jsx[1]!)) visit(jsx[1]!);
        }
      };
      visit(component);
      const files = [...reached];
      pages.push({ path, files, keys: files.flatMap((x) => tourKeysIn(read(x))) });
    }
  }

  const known = (k: string) => tours.some((t) => keyMatches(k, t.key));
  const routesWithoutTour = pages.filter((p) => p.keys.length === 0).map((p) => p.path);
  const unknownKeys = pages.flatMap((p) => p.keys.filter((k) => !known(k)).map((k) => `${p.path}: ${k}`));
  const used = pages.flatMap((p) => p.keys);
  const orphanTours = tours.filter((t) => !t.anyPage && !used.some((k) => keyMatches(k, t.key))).map((t) => t.key);

  const navKeys = [...read(navFile).matchAll(/key:\s*"([^"]+)"/g)].map((m) => m[1]!);
  const derived = (key: string) => {
    if (key === "nav") return true;
    if (key.startsWith("nav.")) return navKeys.includes(key.slice(4));
    if (key.startsWith("list.col.")) return new RegExp(`(id|accessorKey):\\s*"${key.slice(9)}"`).test(allText);
    return false;
  };
  const targetKeys = (tour: TourDef) =>
    tour.steps.flatMap((s) => (s.target === null ? [] : typeof s.target === "string" ? [s.target] : [...s.target]));
  const missingTargets = tours.flatMap((t) =>
    targetKeys(t).filter((k) => !allText.includes(`"${k}"`) && !derived(k)).map((k) => `${t.key}: ${k}`),
  );

  const pageLevelMisses: string[] = [];
  for (const tour of tours.filter((t) => !t.anyPage)) {
    const page = pages.find((p) => p.keys.some((k) => keyMatches(k, tour.key)));
    if (!page) continue;
    const set = new Set(page.files);
    for (const f of page.files) for (const t of appImports(f).values()) set.add(t);
    const text = [...set].map(read).join("\n");
    const keys = targetKeys(tour);
    if (keys.includes("page-more") && !text.includes(`tour="page-more"`)) pageLevelMisses.push(`${tour.key}: page-more`);
    if (keys.includes("page-title") && !/<(PageHeader|RecordHeader)\b/.test(text)) pageLevelMisses.push(`${tour.key}: page-title`);
    if (keys.includes("page-activity") && !text.includes("<ActivityButton")) pageLevelMisses.push(`${tour.key}: page-activity`);
  }

  return { pages, routesWithoutTour, unknownKeys, orphanTours, missingTargets, pageLevelMisses };
}

/** For a test's failure message. */
export const relativeTo = (root: string, files: readonly string[]) => files.map((f) => relative(root, f));
