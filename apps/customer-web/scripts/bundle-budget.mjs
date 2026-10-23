#!/usr/bin/env node
/**
 * The guest bundle budget.
 *
 * Why this script exists instead of an off-the-shelf tool:
 *
 *  Next 16 removed "First Load JS" from `next build` output entirely ("inaccurate in
 *  server-driven architectures using RSC"), and ships no budget feature of its own. Nor can a
 *  glob over `.next/static/chunks/**` do the job — it sums chunks that no single page loads,
 *  and it counts the `noModule` core-js polyfill bundle that no modern browser ever downloads
 *  (~39 KB of phantom weight). Both mistakes make the number fiction, and a fictional budget
 *  is worse than none: it gets "fixed" by raising the limit.
 *
 * So this reads the prerendered HTML next actually serves, takes the exact <script> tags a
 * modern browser will fetch from it (skipping `noModule`), and gzips them. It is ground truth
 * by construction — if the page's HTML doesn't reference it, the browser doesn't download it.
 *
 * This gate fails the build. It does not warn.
 */
import { readFileSync, existsSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { join } from "node:path"

const KB = 1024

/**
 * The guest budget: the measured Next 16 + React 19 framework floor plus modest headroom, so
 * `aws-amplify` (~30–45 KB gz) or vendor bloat cannot reach a public page unnoticed. Raising it needs a
 * reviewed edit with a reason; measure first.
 */
const GUEST_LIMIT = 174 * KB

/**
 * The public pages a guest can reach ((auth)/(account) are budgeted separately). A new public route joins
 * this list in the commit that creates it: an unmeasured product page once sat 58.8 KB over budget
 * (a statically imported analytics SDK).
 */
const GUEST_PAGES = [
  { route: "/", html: ".next/server/app/index.html" },
  // `/search` is the one catalogue page; category tiles link into it with ?category=.
  { route: "/search", html: ".next/server/app/search.html" },
  { route: "/product/[id]", html: ".next/server/app/product/[id].html" },
  { route: "/cart", html: ".next/server/app/cart.html" },
  { route: "/promotions/[id]", html: ".next/server/app/promotions/[id].html" },
  // Public by requirement: a confirmation email links a guest to the first; Google Play requires a deletion path outside the app.
  { route: "/newsletter/confirm", html: ".next/server/app/newsletter/confirm.html" },
  { route: "/delete-account", html: ".next/server/app/delete-account.html" },
  // `/feedback` redirects here.
  { route: "/help", html: ".next/server/app/help.html" },
  { route: "/offers", html: ".next/server/app/offers.html" },
  // The legal documents are rendered from @effy/legal-content.
  { route: "/legal", html: ".next/server/app/legal.html" },
  { route: "/about", html: ".next/server/app/about.html" },
  { route: "/legal/privacy-policy", html: ".next/server/app/legal/privacy-policy.html" },
  { route: "/legal/terms-of-service", html: ".next/server/app/legal/terms-of-service.html" },
  { route: "/legal/refunds-returns", html: ".next/server/app/legal/refunds-returns.html" },
  { route: "/legal/delivery-policy", html: ".next/server/app/legal/delivery-policy.html" },
  { route: "/legal/promotions-terms", html: ".next/server/app/legal/promotions-terms.html" },
  { route: "/legal/food-safety-allergens", html: ".next/server/app/legal/food-safety-allergens.html" },
  // `/checkout/complete` is deliberately absent, and so is every other checkout/account route.
  // This gate measures the guest bundle — what someone who has never signed in must download. Those
  // routes sit behind `requireCustomer` and outside the `(shop)` group, so neither this budget nor
  // the dependency-cruiser Amplify quarantine applies to them. Adding one here would not tighten
  // anything; it would measure a page no guest can reach and fail the build on a signed-in-only cost
  // this budget was never written to govern.
]

/** Every <script src> the browser will actually fetch. `noModule` scripts are the legacy
 *  polyfill bundle: modern browsers parse the attribute and skip the download entirely. */
function scriptsFrom(html) {
  const srcs = new Set()
  const tag = /<script\b([^>]*)>/gi
  let m
  while ((m = tag.exec(html))) {
    const attrs = m[1]
    if (/\bnomodule\b/i.test(attrs)) continue // modern browsers never fetch this
    const src = /\bsrc="([^"]+)"/i.exec(attrs)?.[1]
    if (src?.startsWith("/_next/")) srcs.add(src)
  }
  return srcs
}

function gzOf(src) {
  const p = join(".next", src.replace(/^\/_next\//, ""))
  if (!existsSync(p)) return 0
  return gzipSync(readFileSync(p)).length
}

function main() {
  const missing = GUEST_PAGES.filter((p) => !existsSync(p.html))
  if (missing.length) {
    console.error(
      `✗ Prerendered HTML not found (${missing.map((m) => m.html).join(", ")}).\n` +
        `  Run \`pnpm build\` first.\n` +
        `  If a page is missing after a build, it stopped being prerendered — which is itself\n` +
        `  a failure: a guest page that is not in the static shell has lost its cacheability.`,
    )
    process.exit(1)
  }

  let failed = false
  console.log(
    "\n  Guest first-load JS (gzipped, as a modern browser fetches it — noModule excluded)\n",
  )

  for (const page of GUEST_PAGES) {
    const html = readFileSync(page.html, "utf8")
    const srcs = scriptsFrom(html)

    if (srcs.size === 0) {
      console.error(
        `  ✗ ${page.route}: found ZERO scripts in the prerendered HTML.\n` +
          `    That is not a pass — it means this gate is measuring nothing. Fix the parser.`,
      )
      process.exit(1)
    }

    const bytes = [...srcs].reduce((n, s) => n + gzOf(s), 0)
    const ok = bytes <= GUEST_LIMIT
    if (!ok) failed = true

    console.log(
      `  ${ok ? "✓" : "✗"} ${page.route.padEnd(10)} ${(bytes / KB)
        .toFixed(1)
        .padStart(6)} KB / ${(GUEST_LIMIT / KB).toFixed(0)} KB   (${srcs.size} chunks)`,
    )
  }

  console.log()
  if (failed) {
    console.error(
      "  ✗ GUEST BUDGET EXCEEDED.\n\n" +
        "  Do NOT raise the limit to make this pass. Find out what grew:\n" +
        "      pnpm analyze        # Turbopack import-chain treemap\n\n" +
        "  The likeliest cause is a client component reaching something heavy. If that thing is\n" +
        "  `aws-amplify`, the answer is not a bigger budget — it is the (auth) route group.\n",
    )
    process.exit(1)
  }
  console.log("  ✓ within budget\n")
}

main()
