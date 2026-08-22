// GENERATOR — emits contract-driver/schema.json + contract-driver/DriverDto.kt from the driver wire
// contract (049). src/driver.ts is the SINGLE SOURCE OF TRUTH; this makes the Kotlin DTOs a DERIVED,
// COMMITTED artifact that cannot drift (CI runs `driver-contract:check` = gen + git diff --exit-code).
// Mirrors gen-kotlin-shop-contract.mjs exactly (Principle II).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const SCHEMA = resolve(root, "contract-driver/schema.json");
const DTO = resolve(root, "contract-driver/DriverDto.kt");
const ENTRY = resolve(root, "src/driver-contract.ts");
const PKG = "com.effyshopping.driver.mobile.contract";

// Pinned so a regen years from now produces the SAME bytes (the diff guard depends on determinism).
const TS_GEN = "ts-json-schema-generator@2.4.0";
const QUICKTYPE = "quicktype@25.0.0";

mkdirSync(resolve(root, "contract-driver"), { recursive: true });

// 1. TS → JSON Schema. The `DriverContract` aggregator + `--expose all` forces every referenced DTO
//    into `definitions`.
execFileSync(
  "npx",
  ["--yes", TS_GEN, "-p", ENTRY, "-t", "DriverContract", "--expose", "all", "--no-top-ref", "-o", SCHEMA],
  { stdio: "inherit", cwd: root },
);

// 2. Normalise the schema title so the aggregator root is deterministically named.
const generated = JSON.parse(readFileSync(SCHEMA, "utf8"));
generated.title = "DriverContract";
writeFileSync(SCHEMA, JSON.stringify(generated, null, 2) + "\n");

// 3. JSON Schema → Kotlin (kotlinx.serialization).
execFileSync(
  "npx",
  ["--yes", QUICKTYPE, "--src", SCHEMA, "--src-lang", "schema", "--lang", "kotlin",
    "--framework", "kotlinx", "--package", PKG, "--top-level", "DriverContract", "-o", DTO],
  { stdio: "inherit", cwd: root },
);

// 4. Strip the codegen-only aggregator wrapper class + quicktype's parse-hint header; add a banner.
let kt = readFileSync(DTO, "utf8");
kt = kt.replace(
  /(\/\*\*[\s\S]*?\*\/\s*)?@Serializable\s*\ndata class DriverContract \([\s\S]*?\n\)\n+/,
  "",
);
kt = kt.replace(/^\/\/ To parse the JSON[\s\S]*?\n(?=package )/m, "");
const banner = `// GENERATED FROM packages/shared-types/src/driver.ts (+ problem.ts) — DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types driver-contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
`;
writeFileSync(DTO, banner + "\n" + kt.replace(/^\n+/, ""));

console.log("driver-contract:gen: wrote contract-driver/schema.json + contract-driver/DriverDto.kt");
