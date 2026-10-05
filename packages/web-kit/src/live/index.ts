// 071 — live updates, the framework-free half: the channel client and the burst coalescer.
//
// ⚠ NO REACT HERE. This is re-exported from the package root, which `customer-web` (Next.js)
// imports from server code; a module that calls `createContext` there fails the production build.
// The provider and the status line are exported from `@effy/web-kit/console`.
export { createLiveClient, type LiveClient, type LiveClientOptions, type LiveSocket, type LiveState } from "./client";
export { createCoalescer, type Coalescer } from "./coalesce";
