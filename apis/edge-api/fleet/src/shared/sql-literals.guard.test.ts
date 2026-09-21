import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ⚠ A BACKTICK INSIDE A SQL TEMPLATE LITERAL CLOSES IT, AND THIS HAS NOW HAPPENED THREE TIMES.
 *
 * Writing an explanatory SQL comment that quotes an identifier in Markdown style terminates the
 * surrounding JavaScript template literal. The remaining SQL becomes JavaScript, and `tsc` reports a
 * syntax error several lines away from the fault, pointing at whatever token happened to follow.
 *
 * It is 059's `--chart-*` defect in another language: a glob written inside a CSS comment closed the
 * comment, the remaining prose became stylesheet source, every guard passed, and only the production
 * build failed — quoting a phrase nowhere near the mistake.
 *
 * ⚠ THIS GUARD ITSELF HIT THE BUG WHILE BEING WRITTEN. The first draft matched literals with a regex
 * containing backticks, which esbuild refused. It now counts a character code and never types one.
 *
 * The rule: **a SQL comment uses plain words, never a backtick.**
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, "..");
const BACKTICK = String.fromCharCode(96);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.ts$/.test(e) && !/\.test\.ts$/.test(e) ? [full] : [];
  });
}

/** Split on the backtick character. Odd segment indexes are inside a template literal. */
function templateBodies(src: string): string[] {
  const parts = src.split(BACKTICK);
  return parts.filter((_, i) => i % 2 === 1);
}

describe("SQL template literals contain no stray backticks", () => {
  it("⚠ no SQL comment line carries a backtick, which would close its literal", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(srcRoot)) {
      const src = readFileSync(file, "utf8");
      const rel = file.replace(srcRoot, "");

      // An odd count means at least one literal does not close where its author thought it did.
      const count = src.split(BACKTICK).length - 1;
      if (count % 2 !== 0) offenders.push(`${rel}: ODD number of backticks (${count})`);

      // ⚠ SCANNED OVER THE WHOLE FILE, NOT OVER PARSED LITERAL BODIES — and the first draft of this
      // guard got that wrong and FAILED ITS OWN NEGATIVE PROOF. Adding a PAIR of backticks keeps the
      // total even and merely re-splits the segments, so a body-based scan looks right and sees
      // nothing. A line beginning `--` is a SQL comment wherever it appears in this codebase, so the
      // honest test is the simple one.
      for (const line of src.split("\n")) {
        if (line.trimStart().startsWith("--") && line.includes(BACKTICK)) {
          offenders.push(`${rel}: backtick inside a SQL comment — ${line.trim().slice(0, 60)}`);
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("⚠ the guard is reading real files, so a pass means something", () => {
    // 033 shipped a test that passed VACUOUSLY once the list it checked emptied.
    const withSql = sourceFiles(srcRoot).filter((f) =>
      templateBodies(readFileSync(f, "utf8")).some((b) => /\bSELECT\b/i.test(b)),
    );
    expect(withSql.length, "no SQL literals found — the guard is scanning nothing").toBeGreaterThan(5);
  });
});
