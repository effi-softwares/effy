// Live updates, the framework-free half: the channel client and the coalescer. No React: customer-web
// imports the package root from server code. The provider and status line are in `@effy/web-kit/console`.
export { createLiveClient, type LiveClient, type LiveClientOptions, type LiveSocket, type LiveState } from "./client";
export { createCoalescer, type Coalescer } from "./coalesce";
