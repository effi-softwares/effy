import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Pictures go through `publicImageUrl` / `publicImageAddress` only: a presigned link changes on every
 * request, and `imageUrlOrNull` is the private reader for courier labels.
 */
const src = dirname(fileURLToPath(import.meta.url));

function* files(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* files(full);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) yield full;
  }
}

describe("pictures are addressed publicly, never signed (086)", () => {
  it("no source signs a read link or builds a bucket address", () => {
    const offences: string[] = [];
    for (const file of files(src)) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (/\b(presignRead|imageUrlOrNull|getSignedUrl)\s*\(/.test(line) || /amazonaws\.com/.test(line)) {
            offences.push(`${file.slice(src.length + 1)}:${i + 1}  ${line.trim()}`);
          }
        });
    }
    expect(offences).toEqual([]);
  });
});
