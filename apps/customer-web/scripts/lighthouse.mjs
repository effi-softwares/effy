#!/usr/bin/env node
// The storefront's lab baseline: Lighthouse, mobile, throttled, on three pages.
//
//  node scripts/lighthouse.mjs [--base https://dev.effyshopping.com] [--label before-p2] [--runs 3]
//
// Each page is measured `--runs` times and the median run is kept — one Lighthouse run on a shared
// network varies by a second or more, and a single number would be a coin toss. The summary is written
// to docs/perf/lighthouse/<date>-<label>/ (the full reports are large and are not kept; rerun to see one).
//
// Lab numbers, not field numbers. A simulated slow phone on this machine's network. Compare runs of
// this script with each other; what real customers get is the web-vitals events in PostHog.
//
// Needs Google Chrome installed (CHROME_PATH, or the default macOS location) and network access to npm
// the first time (`npx lighthouse`). It only reads public pages.
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const LIGHTHOUSE = "lighthouse@13.5.0"

/** The pages the backlog names: home, an aisle, a product. Paths, so `--base` can point anywhere. */
const PAGES = [
  { name: "home", path: "/" },
  { name: "aisle", path: "/search?category=dairy_eggs" },
  { name: "product", path: "/product/f96c5ef1-f9ee-4164-a2c3-2956a8954ba3" },
]

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const base = arg("base", "https://dev.effyshopping.com").replace(/\/+$/, "")
const label = arg("label", "run")
const runs = Number(arg("runs", "3"))
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

/** One Lighthouse run → the numbers that matter, in ms / bytes / unitless. */
function measure(url) {
  const out = execFileSync(
    "npx",
    ["-y", LIGHTHOUSE, url, "--only-categories=performance", "--output=json", "--output-path=stdout", "--quiet",
     "--chrome-flags=--headless=new"],
    { env: { ...process.env, CHROME_PATH: chrome }, maxBuffer: 256 * 1024 * 1024 },
  )
  const r = JSON.parse(out.toString("utf8"))
  const a = (id) => r.audits[id]?.numericValue ?? null
  return {
    score: Math.round((r.categories.performance.score ?? 0) * 100),
    lcp: a("largest-contentful-paint"),
    fcp: a("first-contentful-paint"),
    tbt: a("total-blocking-time"),
    cls: a("cumulative-layout-shift"),
    si: a("speed-index"),
    ttfb: a("server-response-time"),
    bytes: a("total-byte-weight"),
    requests: r.audits["network-requests"]?.details?.items?.length ?? null,
  }
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const results = []
for (const page of PAGES) {
  const url = base + page.path
  const all = []
  for (let i = 0; i < runs; i += 1) {
    process.stderr.write(`${page.name} run ${i + 1}/${runs}…\n`)
    all.push(measure(url))
  }
  // The median run by lcp — one whole run, so its numbers belong together.
  const lcps = all.map((m) => m.lcp)
  const pick = all[lcps.indexOf(median(lcps))]
  results.push({ ...page, url, ...pick, lcpRuns: lcps })
}

const date = new Date().toISOString().slice(0, 10)
const here = dirname(fileURLToPath(import.meta.url))
const dir = resolve(here, "../../../docs/perf/lighthouse", `${date}-${label}`)
mkdirSync(dir, { recursive: true })
writeFileSync(resolve(dir, "summary.json"), JSON.stringify({ base, label, date, lighthouse: LIGHTHOUSE, runs, results }, null, 2) + "\n")

const ms = (v) => (v === null ? "—" : `${Math.round(v)}`)
const md = [
  `# Lighthouse — ${label} (${date})`,
  "",
  `\`${base}\` · mobile, simulated throttling · ${LIGHTHOUSE} · median of ${runs} runs by LCP.`,
  "Lab numbers: compare with other runs of `make cw-lighthouse`, not with field data.",
  "",
  "| Page | Score | LCP ms | FCP ms | TBT ms | CLS | Speed index ms | TTFB ms | KB | Requests | LCP of each run |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  ...results.map((r) =>
    `| ${r.name} | ${r.score} | ${ms(r.lcp)} | ${ms(r.fcp)} | ${ms(r.tbt)} | ${r.cls === null ? "—" : r.cls.toFixed(3)} | ${ms(r.si)} | ${ms(r.ttfb)} | ${r.bytes === null ? "—" : Math.round(r.bytes / 1024)} | ${r.requests ?? "—"} | ${r.lcpRuns.map(ms).join(" / ")} |`,
  ),
  "",
]
writeFileSync(resolve(dir, "summary.md"), md.join("\n"))
process.stdout.write(md.join("\n"))
