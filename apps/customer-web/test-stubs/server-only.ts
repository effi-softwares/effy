/**
 * A no-op stand-in for the `server-only` package, used by Vitest alone.
 *
 * ⚠ THIS DOES NOT WEAKEN THE GUARD IT REPLACES. `server-only` exists to make a build FAIL when a
 * module that must stay on the server is pulled into a client bundle — it is a bundler-resolution
 * trick, and it is Next's build (and `depcruise`) that enforce it. Vitest never produces a client
 * bundle, so in a test run the import is not a check that passes or fails: it is an unresolvable
 * specifier that stops the file loading at all.
 *
 * Without this, any test whose import graph touches a server module — which now includes the block
 * renderer, because one block is the newsletter form — cannot run.
 */
export {}
