/** Fails the build when any guest page's first-load JS, gzipped as a modern browser fetches it, exceeds the budget. */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

const KB = 1024
const LIMIT = 174 * KB

const ROUTES = [
  "index",
  "search",
  "product/[id]",
  "cart",
  "promotions/[id]",
  "newsletter/confirm",
  "delete-account",
  "help",
  "offers",
  "legal",
  "about",
  "legal/privacy-policy",
  "legal/terms-of-service",
  "legal/refunds-returns",
  "legal/delivery-policy",
  "legal/promotions-terms",
  "legal/food-safety-allergens",
]

const htmlPath = (route) => `.next/server/app/${route}.html`

function scriptsFrom(html) {
  const srcs = new Set()
  for (const [, attrs] of html.matchAll(/<script\b([^>]*)>/gi)) {
    if (/\bnomodule\b/i.test(attrs)) continue
    const src = /\bsrc="([^"]+)"/i.exec(attrs)?.[1]
    if (src?.startsWith("/_next/")) srcs.add(src)
  }
  return srcs
}

function gzipSize(src) {
  const path = join(".next", src.slice("/_next/".length))
  return existsSync(path) ? gzipSync(readFileSync(path)).length : 0
}

const missing = ROUTES.map(htmlPath).filter((p) => !existsSync(p))
if (missing.length) {
  console.error(`✗ Prerendered HTML not found: ${missing.join(", ")}. Run \`pnpm build\` first.`)
  process.exit(1)
}

const width = Math.max(...ROUTES.map((r) => r.length))
let failed = false

for (const route of ROUTES) {
  const srcs = scriptsFrom(readFileSync(htmlPath(route), "utf8"))
  if (srcs.size === 0) {
    console.error(`✗ ${route}: no scripts found in the prerendered HTML.`)
    process.exit(1)
  }

  const bytes = [...srcs].reduce((n, s) => n + gzipSize(s), 0)
  const ok = bytes <= LIMIT
  if (!ok) failed = true
  console.log(`${ok ? "✓" : "✗"} ${route.padEnd(width)} ${(bytes / KB).toFixed(1).padStart(6)} KB / ${LIMIT / KB} KB`)
}

if (failed) {
  console.error("\n✗ Guest budget exceeded. Run `pnpm analyze` to find what grew.")
  process.exit(1)
}
console.log("\n✓ Within budget")
