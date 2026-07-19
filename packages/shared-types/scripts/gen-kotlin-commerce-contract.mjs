// GENERATOR — emits contract/commerce-schema.json + contract/CommerceDto.kt from the customer COMMERCE
// wire contract (019). Mirrors gen-kotlin-contract.mjs exactly; the only differences are the entry
// aggregator (CustomerCommerceContract), the output file, and a DISTINCT Kotlin package so the
// generated commerce DTOs never collide with the customer-account DTOs in contract/Dto.kt.
//
// src/{storefront,cart,order,checkout,address,favorite}.ts are the SINGLE SOURCE OF TRUTH (Principle II).
// The Kotlin is DERIVED + COMMITTED + drift-guarded (`commerce-contract:check`). ts-json-schema-generator
// + quicktype are invoked via devDependencies — not a Gradle plugin, not in any build graph.

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

// Pinned so a regen years from now produces the SAME bytes (the diff guard depends on determinism).
const TS_GEN = "ts-json-schema-generator@2.4.0";
const QUICKTYPE = "quicktype@25.0.0";

mkdirSync(resolve(root, "contract"), { recursive: true });

// 1. TS → JSON Schema. The `CustomerCommerceContract` aggregator + `--expose all` forces every
//    referenced DTO into `definitions`.
execFileSync(
  "npx",
  ["--yes", TS_GEN, "-p", ENTRY, "-t", "CustomerCommerceContract", "--expose", "all", "--no-top-ref", "-o", SCHEMA],
  { stdio: "inherit", cwd: root },
);

// 2. Normalise the schema title so the aggregator root is deterministically named.
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

// 4. Strip the codegen-only aggregator wrapper class + quicktype's parse-hint header, prepend a banner.
let kt = readFileSync(DTO, "utf8");
kt = kt.replace(
  /(\/\*\*[\s\S]*?\*\/\s*)?@Serializable\s*\ndata class CustomerCommerceContract \([\s\S]*?\n\)\n+/,
  "",
);
kt = kt.replace(/^\/\/ To parse the JSON[\s\S]*?\n(?=package )/m, "");
const banner = `// GENERATED FROM packages/shared-types/src/{storefront,cart,order,checkout,address,favorite}.ts — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types commerce-contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded (019).
`;
writeFileSync(DTO, banner + "\n" + kt.replace(/^\n+/, ""));

console.log("commerce-contract:gen: wrote contract/commerce-schema.json + contract/CommerceDto.kt");
