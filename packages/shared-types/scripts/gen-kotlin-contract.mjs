// Generates contract/schema.json and contract/Dto.kt from the customer contract (src/customer.ts and
// problem.ts). The output is committed and drift-guarded by `contract:check`. ts-json-schema-generator and
// quicktype run from devDependencies, outside any build graph.
//
// quicktype flattens the `PasswordWriteDTO` union into one class with nullable `code`/`currentPassword`
// and a `mode` enum: a valid wire shape. The app's domain layer holds the sealed type.

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

// Pinned, so a regeneration produces the same bytes.
const TS_GEN = "ts-json-schema-generator@2.4.0";
const QUICKTYPE = "quicktype@25.0.0";

mkdirSync(resolve(root, "contract"), { recursive: true });

// 1. TS → JSON Schema; the aggregator and `--expose all` force every referenced DTO in (`-t '*'` drops types).
execFileSync(
  "npx",
  ["--yes", TS_GEN, "-p", ENTRY, "-t", "CustomerContract", "--expose", "all", "--no-top-ref", "-o", SCHEMA],
  { stdio: "inherit", cwd: root },
);

// 2. Name the aggregator root `CustomerContract` (quicktype needs a root object); it is stripped in step 4.
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

// 4. Strip the aggregator wrapper class and quicktype's parse-hint header; prepend a banner.
let kt = readFileSync(DTO, "utf8");
// Remove the `@Serializable\ndata class CustomerContract ( … )` block, incl. any leading KDoc.
kt = kt.replace(
  /(\/\*\*[\s\S]*?\*\/\s*)?@Serializable\s*\ndata class CustomerContract \([\s\S]*?\n\)\n+/,
  "",
);
// Drop quicktype's "To parse the JSON…" comment block (it references the deleted wrapper).
kt = kt.replace(/^\/\/ To parse the JSON[\s\S]*?\n(?=package )/m, "");
const banner = `// GENERATED FROM packages/shared-types/src/customer.ts (+ problem.ts) - DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
// NOTE: PasswordWriteDTO is flattened by design (research D15) - the sealed domain type lives in the app.
`;
writeFileSync(DTO, banner + "\n" + kt.replace(/^\n+/, ""));

console.log("contract:gen: wrote contract/schema.json + contract/Dto.kt");
