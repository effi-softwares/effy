// The one QueryClient — the server-state cache is the source of truth (Principle VI). Handed into
// the router context so route loaders can prime data. The retry policy (never retry a denial,
// twice for transient unavailability) is identical on every surface, so it lives in the kit.
export { createQueryClient } from "@effy/web-kit";
