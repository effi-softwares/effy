import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reads a wire fixture straight out of a mobile contract test, so the Kotlin literal the app decodes
 * is the one the backend proves it produces: one copy, not two.
 */
const here = dirname(fileURLToPath(import.meta.url));
const mobileTests = resolve(here, "../../../../../apps/customer-mobile/shared/src/commonTest/kotlin/com/effyshopping/customer/mobile");

/** The value of `const val NAME = """…"""` (pieces joined by `+` included), as Kotlin would read it. */
export function kotlinFixture(testFile: string, name: string): string {
  const src = readFileSync(resolve(mobileTests, testFile), "utf8");
  const at = src.search(new RegExp(`const\\s+val\\s+${name}\\s*=`));
  if (at < 0) throw new Error(`${testFile} has no \`const val ${name}\` — was the fixture renamed?`);
  let rest = src.slice(src.indexOf("=", at) + 1);
  let out = "";
  for (;;) {
    const piece = /^\s*"""([\s\S]*?)"""/.exec(rest);
    if (!piece) break;
    out += piece[1]!;
    rest = rest.slice(piece[0].length);
    const plus = /^\s*\+/.exec(rest);
    if (!plus) break;
    rest = rest.slice(plus[0].length);
  }
  if (out === "") throw new Error(`${testFile}: \`${name}\` is not a raw string literal`);
  // A raw string cannot hold a literal `$`; Kotlin writes it as ${'$'}.
  return out.replaceAll("${'$'}", "$");
}

/** The fixture parsed. Compare with `toEqual` against `wire(dto)`. */
export const kotlinFixtureJson = (testFile: string, name: string): unknown => JSON.parse(kotlinFixture(testFile, name));

/** What a client actually receives: the value through a real JSON round trip (undefined keys drop out). */
export const wire = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** Every key path in a JSON value — to compare shape where values legitimately differ. */
export function keyPaths(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap((v) => keyPaths(v, `${prefix}[]`)))].sort();
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [`${prefix}.${k}`, ...keyPaths(v, `${prefix}.${k}`)]).sort();
  }
  return [];
}
