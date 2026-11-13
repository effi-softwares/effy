const base = require("./dependency-cruiser.cjs")

module.exports = {
  forbidden: [
    {
      name: "no-heavy-ui-deps-on-guest-first-load",
      severity: "error",
      comment: "radix-ui and vaul are too heavy for the guest bundle budget; import() them on demand. (sonner is gone - the toast is @effy/design-system/toast, 120.)",
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
