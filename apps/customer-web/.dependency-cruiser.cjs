/**
 * THE AMPLIFY QUARANTINE (FR-006, SC-003).
 *
 * A guest who never signs in must download ZERO bytes of the authentication SDK.
 *
 * This is not a style preference — it is the load-bearing assumption behind the whole bundle
 * budget. `aws-amplify` costs roughly 30–45 KB gzipped (AWS advertises ~32 KB; open issues
 * report far more, which is why we measure rather than trust). The guest budget is 120 KB
 * total. Letting the SDK onto the public path spends a third of the budget on machinery that
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
