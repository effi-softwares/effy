// make load-localities ENV=dev [CSVREL=path] — load the AU locality reference data into
// public.locality. Idempotent: running it again changes nothing.
import { readFileSync } from "node:fs";

import { parseFlags, runTool, withDatabase } from "./db";
import { loadLocalities } from "./localities";

runTool("load-localities", async () => {
  const flags = parseFlags(process.argv.slice(2), { csv: "string" });
  const path = typeof flags.csv === "string" ? flags.csv : "db/reference/au-localities.csv";
  const csv = readFileSync(path, "utf8");
  const result = await withDatabase((db) => loadLocalities(db, csv));
  console.log(`load-localities: read ${result.read}, upserted ${result.upserted} from ${path}`);
});
