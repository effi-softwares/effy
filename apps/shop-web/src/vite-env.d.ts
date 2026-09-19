/// <reference types="vite/client" />

/**
 * The build identity, injected by `define` in vite.config.ts.
 *
 * It busts the persisted TanStack Query cache across deploys (059, src/lib/query-persist.ts) — a
 * cache restored into a build whose DTOs have changed renders yesterday's shape into today's
 * components, which is a screen quietly missing fields rather than a crash.
 */
declare const __BUILD_ID__: string;
