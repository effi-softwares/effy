// GENERATOR — emits contract/schema.json + contract/Dto.kt from the customer wire contract (013 D15).
//
// src/customer.ts (+ problem.ts) is the SINGLE SOURCE OF TRUTH. This makes the Kotlin DTOs a
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
const SCHEMA = resolve(root, "contract/schema.json");
const DTO = resolve(root, "contract/Dto.kt");
const ENTRY = resolve(root, "src/customer-contract.ts");
const PKG = "com.effyshopping.customer.mobile.contract";

// Pinned so a regen years from now produces the SAME bytes (the diff guard depends on determinism).
const TS_GEN = "ts-json-schema-generator@2.4.0";
const QUICKTYPE = "quicktype@25.0.0";

mkdirSync(resolve(root, "contract"), { recursive: true });

// 1. TS → JSON Schema. The `CustomerContract` aggregator + `--expose all` forces every referenced
//    DTO into `definitions` (a bare `-t '*'` silently drops types).
execFileSync(
  "npx",
  ["--yes", TS_GEN, "-p", ENTRY, "-t", "CustomerContract", "--expose", "all", "--no-top-ref", "-o", SCHEMA],
  { stdio: "inherit", cwd: root },
);

// 2. Normalise the schema title so the aggregator root is deterministically named `CustomerContract`
//    (quicktype needs a root object to walk; a definitions-only schema yields nothing). It becomes a
//    wrapper class we strip in step 4.
const generated = JSON.parse(readFileSync(SCHEMA, "utf8"));
generated.title = "CustomerContract";
writeFileSync(SCHEMA, JSON.stringify(generated, null, 2) + "\n");

// 3. JSON Schema → Kotlin (kotlinx.serialization). `--top-level CustomerContract` names the root.
execFileSync(
  "npx",
  ["--yes", QUICKTYPE, "--src", SCHEMA, "--src-lang", "schema", "--lang", "kotlin",
    "--framework", "kotlinx", "--package", PKG, "--top-level", "CustomerContract", "-o", DTO],
  { stdio: "inherit", cwd: root },
);

// 4. Strip the codegen-only aggregator wrapper class (its job — forcing every DTO into the schema —
//    is done) and quicktype's stale parse-hint header. Then prepend a provenance banner.
let kt = readFileSync(DTO, "utf8");
// Remove the `@Serializable\ndata class CustomerContract ( … )` block, incl. any leading KDoc.
kt = kt.replace(
  /(\/\*\*[\s\S]*?\*\/\s*)?@Serializable\s*\ndata class CustomerContract \([\s\S]*?\n\)\n+/,
  "",
);
// Drop quicktype's "To parse the JSON…" comment block (it references the deleted wrapper).
kt = kt.replace(/^\/\/ To parse the JSON[\s\S]*?\n(?=package )/m, "");
const banner = `// GENERATED FROM packages/shared-types/src/customer.ts (+ problem.ts) — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
// NOTE: PasswordWriteDTO is flattened by design (research D15) — the sealed domain type lives in the app.
`;
writeFileSync(DTO, banner + "\n" + kt.replace(/^\n+/, ""));

console.log("contract:gen: wrote contract/schema.json + contract/Dto.kt");
