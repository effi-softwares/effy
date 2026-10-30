// Generates contract/commerce-schema.json and contract/CommerceDto.kt from the customer commerce contract
// (CustomerCommerceContract), in its own Kotlin package so it never collides with contract/Dto.kt. The
// output is committed and drift-guarded by `commerce-contract:check`.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const SCHEMA = resolve(root, "contract/commerce-schema.json");
const DTO = resolve(root, "contract/CommerceDto.kt");
const ENTRY = resolve(root, "src/customer-commerce-contract.ts");
const PKG = "com.effyshopping.customer.mobile.commerce.contract";

// Pinned, so a regeneration produces the same bytes.
const TS_GEN = "ts-json-schema-generator@2.4.0";
const QUICKTYPE = "quicktype@25.0.0";

mkdirSync(resolve(root, "contract"), { recursive: true });

// 1. TS → JSON Schema; the aggregator and `--expose all` force every referenced DTO into `definitions`.
execFileSync(
  "npx",
  ["--yes", TS_GEN, "-p", ENTRY, "-t", "CustomerCommerceContract", "--expose", "all", "--no-top-ref", "-o", SCHEMA],
  { stdio: "inherit", cwd: root },
);

// 2. Name the aggregator root deterministically.
const generated = JSON.parse(readFileSync(SCHEMA, "utf8"));
generated.title = "CustomerCommerceContract";
writeFileSync(SCHEMA, JSON.stringify(generated, null, 2) + "\n");

// 3. JSON Schema → Kotlin (kotlinx.serialization).
execFileSync(
  "npx",
  ["--yes", QUICKTYPE, "--src", SCHEMA, "--src-lang", "schema", "--lang", "kotlin",
    "--framework", "kotlinx", "--package", PKG, "--top-level", "CustomerCommerceContract", "-o", DTO],
  { stdio: "inherit", cwd: root },
);

// 4. Strip the codegen-only aggregator class and quicktype's parse-hint header; prepend a banner.
let kt = readFileSync(DTO, "utf8");
kt = kt.replace(
  /(\/\*\*[\s\S]*?\*\/\s*)?@Serializable\s*\ndata class CustomerCommerceContract \([\s\S]*?\n\)\n+/,
  "",
);
kt = kt.replace(/^\/\/ To parse the JSON[\s\S]*?\n(?=package )/m, "");
const banner = `// GENERATED FROM packages/shared-types/src/{storefront,cart,order,checkout,address,saved-item}.ts - DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types commerce-contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded (019).
`;
writeFileSync(DTO, banner + "\n" + kt.replace(/^\n+/, ""));

console.log("commerce-contract:gen: wrote contract/commerce-schema.json + contract/CommerceDto.kt");
