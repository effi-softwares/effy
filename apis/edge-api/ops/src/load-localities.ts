// make load-localities ENV=dev [CSVREL=path]. Idempotent.
import { readFileSync } from "node:fs";

import { parseFlags, runTool, withDatabase } from "./db";
import { loadLocalities } from "./localities";

/** One line, rewritten in place on a terminal; a line per 10% when the output is piped or logged. */
function progressPrinter(): (done: number, total: number) => void {
  const tty = process.stderr.isTTY === true;
  const started = Date.now();
  let lastDraw = 0;
  let lastDecile = -1;
  return (done, total) => {
    if (done === 0) {
      process.stderr.write(`load-localities: connected, upserting ${total} rows\n`);
      return;
    }
    const pct = total === 0 ? 100 : Math.floor((done / total) * 100);
    const secs = (Date.now() - started) / 1000;
    const rate = secs > 0 ? done / secs : 0;
    const left = rate > 0 ? Math.round((total - done) / rate) : 0;
    const line = `  ${done}/${total} (${pct}%)  ${Math.round(rate)} rows/s  ~${Math.floor(left / 60)}m${String(left % 60).padStart(2, "0")}s left`;
    if (tty) {
      const now = Date.now();
      if (done === total || now - lastDraw >= 200) {
        lastDraw = now;
        process.stderr.write(`\r\x1b[2K${line}`);
        if (done === total) process.stderr.write("\n");
      }
    } else if (Math.floor(pct / 10) !== lastDecile || done === total) {
      lastDecile = Math.floor(pct / 10);
      process.stderr.write(`${line}\n`);
    }
  };
}

runTool("load-localities", async () => {
  const flags = parseFlags(process.argv.slice(2), { csv: "string" });
  const path = typeof flags.csv === "string" ? flags.csv : "db/reference/au-localities.csv";
  const csv = readFileSync(path, "utf8");
  console.log(`load-localities: reading ${path}, connecting to the database…`);
  const result = await withDatabase((db) => loadLocalities(db, csv, progressPrinter()));
  console.log(`load-localities: read ${result.read}, upserted ${result.upserted} from ${path}`);
});
