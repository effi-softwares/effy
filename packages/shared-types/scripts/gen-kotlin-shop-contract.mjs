// GENERATOR — emits contract-shop/schema.json + contract-shop/ShopDto.kt from the customer wire contract (013 D15).
//
// src/shop.ts (+ problem.ts) is the SINGLE SOURCE OF TRUTH. This makes the Kotlin DTOs a
// DERIVED, COMMITTED artifact that cannot drift: CI runs `contract:check` (gen + `git diff
// --exit-code`), so a TS field added and not regenerated fails the build. There is no state in
// which the Kotlin is stale and green.
//
// Two external CLIs (ts-json-schema-generator, quicktype) are invoked via the package's
// devDependencies — NOT a Gradle plugin, NOT in any build graph. If they vanished we'd lose a
// script, not a codebase, and the committed Dto.kt would still compile.
//
// KNOWN, ACCEPTED wart (research D15): quicktype flattens the `PasswordWriteDTO` discriminated
// union into one class with nullable `code`/`currentPassword` + a `mode` enum. That is a valid WIRE
// shape. The type-safe sealed representation lives in the KMP app's DOMAIN layer (DTO→domain,
// Principle VI) — we do NOT hand-edit this generated file, or `contract:check` would fail on every
// regen.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const SCHEMA = resolve(root, "contract-shop/schema.json");
const DTO = resolve(root, "contract-shop/ShopDto.kt");
const ENTRY = resolve(root, "src/shop-contract.ts");
const PKG = "com.effyshopping.shop.mobile.contract";

// Pinned so a regen years from now produces the SAME bytes (the diff guard depends on determinism).
const TS_GEN = "ts-json-schema-generator@2.4.0";
const QUICKTYPE = "quicktype@25.0.0";

mkdirSync(resolve(root, "contract-shop"), { recursive: true });

// 1. TS → JSON Schema. The `ShopContract` aggregator + `--expose all` forces every referenced
//    DTO into `definitions` (a bare `-t '*'` silently drops types).
execFileSync(
  "npx",
  ["--yes", TS_GEN, "-p", ENTRY, "-t", "ShopContract", "--expose", "all", "--no-top-ref", "-o", SCHEMA],
  { stdio: "inherit", cwd: root },
);

// 2. Normalise the schema title so the aggregator root is deterministically named `ShopContract`
//    (quicktype needs a root object to walk; a definitions-only schema yields nothing). It becomes a
//    wrapper class we strip in step 4.
const generated = JSON.parse(readFileSync(SCHEMA, "utf8"));
generated.title = "ShopContract";
writeFileSync(SCHEMA, JSON.stringify(generated, null, 2) + "\n");

// 3. JSON Schema → Kotlin (kotlinx.serialization). `--top-level ShopContract` names the root.
execFileSync(
  "npx",
  ["--yes", QUICKTYPE, "--src", SCHEMA, "--src-lang", "schema", "--lang", "kotlin",
    "--framework", "kotlinx", "--package", PKG, "--top-level", "ShopContract", "-o", DTO],
  { stdio: "inherit", cwd: root },
);

// 4. Strip the codegen-only aggregator wrapper class (its job — forcing every DTO into the schema —
//    is done) and quicktype's stale parse-hint header. Then prepend a provenance banner.
let kt = readFileSync(DTO, "utf8");
// Remove the `@Serializable\ndata class ShopContract ( … )` block, incl. any leading KDoc.
kt = kt.replace(
  /(\/\*\*[\s\S]*?\*\/\s*)?@Serializable\s*\ndata class ShopContract \([\s\S]*?\n\)\n+/,
  "",
);
// Drop quicktype's "To parse the JSON…" comment block (it references the deleted wrapper).
kt = kt.replace(/^\/\/ To parse the JSON[\s\S]*?\n(?=package )/m, "");
const banner = `// GENERATED FROM packages/shared-types/src/shop.ts (+ problem.ts) — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
// NOTE: (shop DTOs: email/shop nullable, roles as List<String> narrowed in the app domain).
`;
writeFileSync(DTO, banner + "\n" + kt.replace(/^\n+/, ""));

console.log("contract:gen: wrote contract-shop/schema.json + contract-shop/ShopDto.kt");
