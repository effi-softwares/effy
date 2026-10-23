/**
 * The Amplify quarantine: a guest who never signs in downloads none of the auth SDK (30–45 KB gzipped
 * against a 176 KB guest budget). The root layout is on every route, so Amplify (whose docs say to
 * configure it there) is configured in `app/(auth)/layout.tsx` only, and this rule fails the build if
 * it is reachable from anywhere else.
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
        // `reachable: true` matches transitive imports (page → component → aws-amplify), which is what a real leak looks like.
        reachable: true,
        path: "aws-amplify|@aws-amplify",
      },
    },
    {
      /**
       * The guest-path quarantine for `radix-ui` and `sonner`: the platform's UI standard, but too heavy
       * for the public path's budget (scripts/bundle-budget.mjs). Guest interactions use CSS scroll-snap,
       * position: sticky, a small toast store and native <dialog> instead. They stay the standard in
       * app/(auth)/, app/(account)/, app/checkout/ and the consoles.
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
        // `reachable: true`, as for the Amplify rule.
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
    // See into node_modules to detect the aws-amplify reach, without traversing it.
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
