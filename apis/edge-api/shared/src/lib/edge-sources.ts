import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { EDGE_API_DIR } from "./serverless-stacks";

/** Every non-test `.ts` file under each service's `src` (and the shared library), for guards. Paths are edge-api-relative. */
export function edgeSources(): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
        out.push({ file: full.slice(EDGE_API_DIR.length + 1), text: readFileSync(full, "utf8") });
      }
    }
  };
  for (const service of readdirSync(EDGE_API_DIR)) {
    const src = resolve(EDGE_API_DIR, service, "src");
    if (existsSync(src) && statSync(src).isDirectory()) walk(src);
  }
  return out;
}
