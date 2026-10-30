// Generates contract-driver/schema.json and contract-driver/DriverDto.kt from the driver contract
// (src/driver.ts). The output is committed and drift-guarded by `driver-contract:check`.

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

// Pinned, so a regeneration produces the same bytes.
const TS_GEN = "ts-json-schema-generator@2.4.0";
const QUICKTYPE = "quicktype@25.0.0";

mkdirSync(resolve(root, "contract-driver"), { recursive: true });

// 1. TS → JSON Schema; the aggregator and `--expose all` force every referenced DTO into `definitions`.
execFileSync(
  "npx",
  ["--yes", TS_GEN, "-p", ENTRY, "-t", "DriverContract", "--expose", "all", "--no-top-ref", "-o", SCHEMA],
  { stdio: "inherit", cwd: root },
);

// 2. Name the aggregator root deterministically.
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

// 4. Strip the aggregator wrapper class and quicktype's parse-hint header; add a banner.
let kt = readFileSync(DTO, "utf8");
kt = kt.replace(
  /(\/\*\*[\s\S]*?\*\/\s*)?@Serializable\s*\ndata class DriverContract \([\s\S]*?\n\)\n+/,
  "",
);
kt = kt.replace(/^\/\/ To parse the JSON[\s\S]*?\n(?=package )/m, "");
const banner = `// GENERATED FROM packages/shared-types/src/driver.ts (+ problem.ts) - DO NOT EDIT.
// Regenerate: pnpm --filter @effy/shared-types driver-contract:gen
// The wire contract lives in TypeScript ONCE (Principle II); this file is derived and diff-guarded.
`;
writeFileSync(DTO, banner + "\n" + kt.replace(/^\n+/, ""));

console.log("driver-contract:gen: wrote contract-driver/schema.json + contract-driver/DriverDto.kt");
