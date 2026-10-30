import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A backtick inside a SQL template literal closes it and `tsc` reports the error far away. A SQL
 * comment uses plain words, never a backtick. This guard counts the character code, never types one.
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

/** Odd segment indexes are inside a template literal. */
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

      // An odd count means a literal does not close where its author thought.
      const count = src.split(BACKTICK).length - 1;
      if (count % 2 !== 0) offenders.push(`${rel}: ODD number of backticks (${count})`);

      // Over the whole file, not parsed bodies: a pair of backticks keeps the count even. A line starting `--` is a SQL comment.
      for (const line of src.split("\n")) {
        if (line.trimStart().startsWith("--") && line.includes(BACKTICK)) {
          offenders.push(`${rel}: backtick inside a SQL comment - ${line.trim().slice(0, 60)}`);
        }
      }
    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("⚠ the guard is reading real files, so a pass means something", () => {
    // A guard that scans nothing passes forever.
    const withSql = sourceFiles(srcRoot).filter((f) =>
      templateBodies(readFileSync(f, "utf8")).some((b) => /\bSELECT\b/i.test(b)),
    );
    expect(withSql.length, "no SQL literals found - the guard is scanning nothing").toBeGreaterThan(5);
  });
});
