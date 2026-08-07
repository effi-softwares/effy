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
 *
 * ── RATCHET, 2026-07-27 (feature 025, task T020) ────────────────────────────────────────────
 *
 * 160 KB → 176 KB. Measured, not conceded. Both guest routes were ALREADY over before feature
 * 025 changed a line: `/` at 167.4 KB and `/browse` at 160.1 KB.
 *
 * A per-chunk gzip breakdown (specs/025-customer-ui-refresh/research.md § R6a) attributed it:
 *
 *   • 143.5 KB — the Next 16.2.6 + React 19.2.4 framework floor. NINE chunks, one carrying the
 *     only `react-dom` marker, on `/browse` — which at the time of measurement was a static
 *     placeholder with essentially no app content. That is 89.6% of the old budget spent before
 *     this app's own code runs.
 *   • 16.6 KB — the appearance switcher (`next-themes` + AppearanceControl). Principle V
 *     REQUIRES dark mode to be user-selectable, so this is not discretionary weight.
 *   • 7.3 KB — RecentlyViewedRail, on `/` only. It is the entire difference between the routes.
 *
 * The floor 011 measured was ~136 KB, and 160 was set to leave ~24 KB of app headroom on top of
 * it. The floor grew ~7.5 KB; 176 restores that same headroom rather than inventing new slack.
 *
 * ⚠ AND THEN WIDENING THIS LIST FOUND A REAL LEAK. On `/` and `/browse` there was none. But this
 * gate had only ever measured those two of the five routes a guest can reach — and the moment
 * /search, /product/[id] and /cart were added, the product page came in at 234.8 KB: 58.8 KB over,
 * never once measured, for two features.
 *
 * The cause was 67.9 KB gz of `posthog-js`, reached via product/[id]/page.tsx → RecordView.tsx →
 * lib/telemetry.ts, which STATICALLY imported it while its own module comment promised "for a
 * guest who never consents, the analytics SDK never loads at all". Consent gated whether it was
 * called, never whether it was downloaded. The import is now dynamic; the product page dropped to
 * 166.9 KB.
 *
 * The lesson is in this list, not in the number: a gate that watches two of five routes has three
 * blind spots, and they were the routes shoppers actually spend time on.
 *
 * At 176 KB with routes sitting at 160–168, the gate still does its original job — a 30–45 KB SDK
 * cannot hide in that headroom.
 *
 * ⚠ THE NUMBER THAT LANDED IS 174, NOT 176. The 176 above is the ratchet as PROPOSED; the T102 note
 * below then measured a 0.9 KB saving and the constant was set to 174. Everything above this line
 * that says "176" is describing the proposal, not `GUEST_LIMIT`. Read the constant, not the prose.
 *
 * ⚠ T102 (`next-themes` → an inline pre-paint script + a `useSyncExternalStore` store) IS NOW DONE,
 * and the estimate that justified it was WRONG. It was recorded here as "~8.3 KB on every guest
 * page"; the dependency's own `dist/index.mjs` is **1.5 KB gzipped**, and the replacement store
 * costs ~0.6 KB of its own, so the measured saving is **0.9 KB** — not the ~8 KB that would have
 * brought this limit to ~168 KB. The change was still worth making (one fewer dependency, and the
 * appearance logic is now ours and unit-tested), but it does not buy the headroom that was claimed.
 *
 * The number below is ratcheted by what was actually measured, not by what was hoped for. If a
 * future change needs more room, MEASURE FIRST — this line is the cautionary tale.
 *
 * ── MEASURED, 2026-07-29 (feature 026, task T001) ───────────────────────────────────────────
 *
 * Baseline before the monochrome identity change, all five guest routes:
 *
 *   /              170.5 KB      /browse        168.5 KB      /search        171.9 KB
 *   /product/[id]  170.7 KB      /cart          170.9 KB
 *
 * ⚠ HEADROOM IS 2.1–5.5 KB, NOT the ~24 KB the ratchet rationale above assumes. `/search` has
 * ~2 KB of slack. The "a 30–45 KB SDK cannot hide in that headroom" claim is still true, but the
 * margin for ordinary growth is now thin enough that any dependency change must be measured
 * immediately rather than at the end of a feature.
 */
const GUEST_LIMIT = 174 * KB

/** The public pages a guest can reach. (auth)/(account) are budgeted separately — the SDK
 *  legitimately lives there.
 *
 *  ⚠ Feature 025 added /search, /product/[id], and /cart. Before that this list was just `/` and
 *  /browse — so the gate was silently ignoring the routes a shopper actually spends time on, and
 *  a leak on the product page would not have failed the build. A budget that only watches two of
 *  five guest routes is a budget with three blind spots. */
const GUEST_PAGES = [
  { route: "/", html: ".next/server/app/index.html" },
  { route: "/browse", html: ".next/server/app/browse.html" },
  { route: "/search", html: ".next/server/app/search.html" },
  { route: "/product/[id]", html: ".next/server/app/product/[id].html" },
  { route: "/cart", html: ".next/server/app/cart.html" },
  // ⚠ Added 2026-08-01 with the route itself, not afterwards. A guest reaches this page by tapping a
  // promotional banner on the home page — the most prominent link on the storefront. The note above
  // records what happened the last time a guest-reachable route went unmeasured: /product/[id] was
  // 58.8 KB over budget for two features before anyone looked. A new public route joins this list in
  // the same commit that creates it, or the gate is measuring a storefront that no longer exists.
  { route: "/promotions/[id]", html: ".next/server/app/promotions/[id].html" },
  // ⚠ Added 2026-08-03 with the routes themselves (034 FR-058c), not afterwards.
  //
  // All three are PUBLIC by requirement, not by accident:
  //   • /delete-account — Google Play requires a deletion path reachable OUTSIDE the app, by someone
  //     who has uninstalled it. Apple does not require this, which is why it gets skipped, and why a
  //     missing or invalid deletion link is the most-reported Play rejection in this area.
  //   • /legal/privacy, /legal/terms — both stores require an in-app privacy policy link backed by
  //     an active, publicly accessible, non-geofenced URL.
  //
  // They are static content today. They are listed anyway, because the note above records exactly
  // what happens when a public route is not measured: /product/[id] sat 58.8 KB over budget for two
  // features before anyone looked.
  // ⚠ Added 2026-08-07 with the route itself (039 US6), not afterwards. A guest reaches this page by
  // following a link in a confirmation email — it is public by requirement, since the recipient may
  // have no account and never will. The note above records what happened the last time a
  // guest-reachable route went unmeasured: /product/[id] sat 58.8 KB over budget for two features.
  { route: "/newsletter/confirm", html: ".next/server/app/newsletter/confirm.html" },
  { route: "/delete-account", html: ".next/server/app/delete-account.html" },
  { route: "/legal/privacy", html: ".next/server/app/legal/privacy.html" },
  { route: "/legal/terms", html: ".next/server/app/legal/terms.html" },
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
