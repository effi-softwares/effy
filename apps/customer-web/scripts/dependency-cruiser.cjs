/** Fails the build when a guest route can reach the auth SDK or the heavy UI libraries, or when imports form a cycle. */
const GUEST_PATHS = [
  "^app/layout\\.tsx$",
  "^app/page\\.tsx$",
  "^app/\\(shop\\)/",
  "^app/sitemap\\.ts$",
  "^app/robots\\.ts$",
  "^components/header/",
]

module.exports = {
  forbidden: [
    {
      name: "no-amplify-on-guest-path",
      severity: "error",
      comment: "Configure Amplify in app/(auth)/layout.tsx only; read the session server-side on guest pages.",
      from: { path: GUEST_PATHS },
      to: { reachable: true, path: "aws-amplify|@aws-amplify" },
    },
    {
      name: "no-heavy-ui-deps-on-guest-path",
      severity: "error",
      comment: "radix-ui, sonner and vaul are too heavy for the guest bundle budget.",
      from: { path: [...GUEST_PATHS, "^components/theme/"] },
      to: { reachable: true, path: "^(radix-ui|@radix-ui|sonner|vaul)($|/)" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      from: { orphan: true, pathNot: "^app/" },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".js", ".jsx", ".ts", ".tsx"],
    },
  },
}
