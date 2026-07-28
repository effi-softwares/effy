/**
 * THE AMPLIFY QUARANTINE (FR-006, SC-003).
 *
 * A guest who never signs in must download ZERO bytes of the authentication SDK.
 *
 * This is not a style preference — it is the load-bearing assumption behind the whole bundle
 * budget. `aws-amplify` costs roughly 30–45 KB gzipped (AWS advertises ~32 KB; open issues
 * report far more, which is why we measure rather than trust). The guest budget is 176 KB
 * total, of which only ~32 KB is this app's own code — the rest is framework floor. Letting the
 * SDK onto the public path would spend the app's ENTIRE code allowance on machinery that
 * anonymous shoppers, and crawlers, will never use.
 *
 * The trap this guard exists to catch:
 *
 *   Amplify's own documentation tells you to call `Amplify.configure()` in `app/layout.tsx`.
 *   Their docs assume an app where everyone is signed in. Ours is a storefront where most
 *   visitors never sign in. The root layout is on EVERY route, so a client module imported
 *   there lands in the SHARED client chunk that every page loads — including the catalog pages
 *   whose speed and search visibility are the entire reason this surface exists.
 *
 *   The regression is one careless `import` in a shared header component away, it produces no
 *   error, and nothing about the page looks wrong. It would simply be slower, forever.
 *
 * So it gets a machine guard rather than a code-review convention. The SDK is configured in
 * `app/(auth)/layout.tsx` and nowhere else.
 *
 * ⚠ This rule is proven to work: T020 deliberately adds `import "aws-amplify"` to the root
 * layout and confirms this goes RED. A guard nobody has watched fail is not a guard.
 */
module.exports = {
  forbidden: [
    {
      name: "no-amplify-on-guest-path",
      severity: "error",
      comment:
        "A guest route can REACH aws-amplify. This puts the auth SDK in the client chunks that " +
        "anonymous visitors download, and breaches the guest bundle budget (FR-006 / SC-003). " +
        "Configure Amplify in app/(auth)/layout.tsx ONLY. If a guest page needs to know who the " +
        "visitor is, read the session SERVER-side (see components/header/UserIsland.tsx) — that " +
        "costs the browser nothing.",
      from: {
        path: [
          "^app/layout\\.tsx$",
          "^app/page\\.tsx$",
          "^app/\\(shop\\)/",
          "^app/sitemap\\.ts$",
          "^app/robots\\.ts$",
          "^components/header/",
        ],
      },
      to: {
        // ⚠ `reachable: true` is LOAD-BEARING — do not remove it.
        //
        // Without it, dependency-cruiser only matches DIRECT imports. The first version of this
        // rule did exactly that, and it MISSED a real leak: `page.tsx → Leak.tsx → aws-amplify`
        // was reported clean, because the page imported a component, and the *component*
        // imported the SDK. That is what an actual regression looks like — nobody imports
        // `aws-amplify` straight into a page; they import a header, or a hook, or a provider
        // that does. A rule that only sees one hop is a rule that only catches the mistake
        // nobody makes.
        reachable: true,
        path: "aws-amplify|@aws-amplify",
      },
    },
    {
      /**
       * THE GUEST-PATH DEPENDENCY QUARANTINE (feature 025, FR-049 / contracts/customer-ui.contract.md §1).
       *
       * Same idea as the Amplify rule above, one level less obvious. Amplify is something nobody
       * would put on a storefront on purpose. These are the opposite: `radix-ui` and `sonner` ARE
       * the platform's locked UI standard, they are already dependencies of this app, and reaching
       * for `<Dialog>` or `toast()` on a public page is the natural thing to do. That is exactly why
       * it needs a machine guard — the mistake here is a good habit applied on the wrong route.
       *
       * The public path has a measured budget (176 KB, and 143.5 KB of it is framework floor before
       * this app writes a line — see scripts/bundle-budget.mjs). Every guest interaction feature 025
       * adds is achievable without them:
       *
       *   carousel + gallery + sticky summary → CSS scroll-snap / position: sticky   (zero JS)
       *   toast                               → ~30-line useSyncExternalStore store
       *   delivery picker + mini-cart         → native <dialog>
       *
       * These packages remain the standard everywhere they are affordable: app/(auth)/,
       * app/(account)/, app/checkout/, and both internal consoles, which have no budget at all.
       * This rule is scoped to the public path, not the app.
       */
      name: "no-heavy-ui-deps-on-guest-path",
      severity: "error",
      comment:
        "A guest route can REACH radix-ui / sonner / vaul. These are the platform's UI standard but " +
        "not on the PUBLIC path, which has a measured byte budget (contracts/customer-ui.contract.md " +
        "§1). Use CSS scroll-snap for carousels and galleries, position: sticky for sticky summaries, " +
        "a useSyncExternalStore store for toasts, and a native <dialog> for the delivery picker and " +
        "mini-cart. Radix and sonner stay the standard in (auth)/(account)/checkout and both consoles.",
      from: {
        path: [
          "^app/layout\\.tsx$",
          "^app/page\\.tsx$",
          "^app/\\(shop\\)/",
          "^app/sitemap\\.ts$",
          "^app/robots\\.ts$",
          "^components/header/",
          "^components/theme/",
        ],
      },
      to: {
        // ⚠ `reachable: true` is LOAD-BEARING for the same reason it is on the Amplify rule —
        // nobody imports `sonner` straight into a page; they import a component that does.
        reachable: true,
        path: "^(radix-ui|@radix-ui|sonner|vaul)($|/)",
      },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "Circular dependency — untangle it.",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "Orphaned module — nothing imports it. Delete it or wire it up.",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
          "\\.d\\.ts$",
          "(^|/)tsconfig\\.json$",
          "(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts|json)$",
          "^app/",
          "^e2e/",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // We must SEE into node_modules to detect the aws-amplify reach, but not traverse it.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".js", ".jsx", ".ts", ".tsx"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
}
