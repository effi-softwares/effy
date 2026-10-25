/**
 * Fails the build when a guest route can reach the auth SDK, or when imports form a cycle. The heavy UI
 * libraries are held to the first load only, in `dependency-cruiser.first-load.cjs`.
 */
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
