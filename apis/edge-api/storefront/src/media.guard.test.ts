import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * ⚠ A SHOPPER'S PICTURE HAS ONE ADDRESS, AND THIS SERVICE ONLY EVER BUILDS THAT ONE (086).
 *
 * Every picture this service sends goes through `publicImageUrl` / `publicImageAddress`
 * (@effy/edge-shared), which answers only for the public set. A presigned link here would bring back
 * the address that changes on every request — the browser could never keep the picture — and
 * `imageUrlOrNull` is the PRIVATE reader that courier labels go through. Neither belongs here.
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
