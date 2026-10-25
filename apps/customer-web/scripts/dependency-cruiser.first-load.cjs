/**
 * Fails the build when a guest route's FIRST LOAD can reach radix, vaul or sonner — too heavy for the
 * guest bundle budget. Dynamic `import()`s are left out of the graph: the overlays a guest route opens
 * (components/overlays/lazy.ts) are shadcn components fetched when the shopper reaches for them.
 *
 * The path is matched against the RESOLVED file (`…/node_modules/radix-ui/…`). The rule this replaced
 * anchored on the bare package name (`^radix-ui`), which a resolved path never starts with, and so
 * passed whatever was imported.
 */
const base = require("./dependency-cruiser.cjs")

module.exports = {
  forbidden: [
    {
      name: "no-heavy-ui-deps-on-guest-first-load",
      severity: "error",
      comment: "radix-ui, sonner and vaul are too heavy for the guest bundle budget; import() them on demand.",
      // The guest routes' entry files: what loads with the page, followed through static imports only.
      from: {
        path: [
          "^app/(layout|page|not-found|error|global-error|loading)\\.tsx$",
          "^app/\\(shop\\)/(layout|page|not-found|error|loading|template)\\.tsx$",
          "^app/\\(shop\\)/.+/(layout|page|not-found|error|loading|template)\\.tsx$",
        ],
      },
      to: { reachable: true, path: "(^|/)node_modules/(radix-ui|@radix-ui/[^/]+|sonner|vaul)/" },
    },
  ],
  options: { ...base.options, exclude: { dynamic: true } },
}
