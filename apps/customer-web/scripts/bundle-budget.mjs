#!/usr/bin/env node
/**
 * THE GUEST BUNDLE BUDGET (FR-005, FR-006, SC-003).
 *
 * Why this script exists instead of an off-the-shelf tool:
 *
 *   Next 16 REMOVED "First Load JS" from `next build` output entirely ("inaccurate in
 *   server-driven architectures using RSC"), and ships no budget feature of its own. Nor can a
 *   glob over `.next/static/chunks/**` do the job — it sums chunks that no single page loads,
 *   and it counts the `noModule` core-js polyfill bundle that NO MODERN BROWSER EVER DOWNLOADS
 *   (~39 KB of phantom weight). Both mistakes make the number fiction, and a fictional budget
 *   is worse than none: it gets "fixed" by raising the limit.
 *
 * So this reads the PRERENDERED HTML NEXT ACTUALLY SERVES, takes the exact <script> tags a
 * modern browser will fetch from it (skipping `noModule`), and gzips them. It is ground truth
 * by construction — if the page's HTML doesn't reference it, the browser doesn't download it.
 *
 * This gate FAILS THE BUILD. It does not warn (FR-005).
 */
import { readFileSync, existsSync } from "node:fs"
import { gzipSync } from "node:zlib"
import { join } from "node:path"

const KB = 1024

/**
 * BUDGETS — measured, not aspirational. See research.md D9 (CORRECTED 2026-07-14).
 *
 * ⚠ The research pass proposed a 120 KB guest budget on the stated assumption that Next's
 * framework baseline was "~90–110 KB compressed before you write a line". THAT ESTIMATE WAS
 * WRONG for Next 16 + React 19: measured on this app, with essentially zero client code, the
 * floor is ~136 KB. A 120 KB budget was therefore unreachable by construction — it would have
 * failed on an empty app, which is a broken gate, not a strict one. Research D9 itself said
 * "measure it in your own build; do not trust the number." We did, and it didn't.
 *
 * The budget below is the measured floor plus deliberate, modest headroom. It still does the
 * job it was created for:
 *
 *   • `aws-amplify` (~30–45 KB gz) cannot reach the guest path without blowing it.
 *   • App-code and vendor bloat on public pages is caught.
 *   • It RATCHETS: raising the number requires editing this file in a reviewed diff, with a
 *     reason. It cannot drift upward silently, which is how bundle budgets normally die.
 */
const GUEST_LIMIT = 160 * KB

/** The public pages a guest can reach. (auth)/(account) are budgeted separately — the SDK
 *  legitimately lives there. */
const GUEST_PAGES = [
  { route: "/", html: ".next/server/app/index.html" },
  { route: "/browse", html: ".next/server/app/browse.html" },
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
