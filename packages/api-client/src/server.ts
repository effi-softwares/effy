import type { ProblemJSON } from "@effy/shared-types";
import { toDomainError, type DomainError } from "./errors";

/**
 * The SERVER-side API client (011).
 *
 * The browser client (`ApiClient`) pulls a fresh token from an auth library on every call and
 * never caches. On a server-rendered surface both of those are wrong:
 *
 *   • There is no auth library on the server — the token has already been resolved from the
 *     request's cookies by the caller. So the token is INJECTED, not fetched.
 *   • Public reads SHOULD be cached (that is the whole point of an SSR storefront), and the
 *     caller needs to say for how long and under which invalidation tag.
 *
 * This client therefore takes an optional token and passes framework cache options straight
 * through as an opaque `RequestInit`. It deliberately does NOT import anything from Next.js —
 * this package is consumed by Vite SPAs too, and a framework import here would infect them
 * (Principle II: shared packages stay audience- and framework-neutral).
 *
 * Callers on the storefront pass `{ next: { tags: [...], revalidate: N } }`; a caller elsewhere
 * can pass whatever its own runtime understands, or nothing at all.
 */
export interface ServerApiClientConfig {
  baseUrl: string;
  /** Already-resolved bearer token, or null for an anonymous (public) read. */
  token?: string | null;
}

export class ServerApiClient {
  constructor(private readonly config: ServerApiClientConfig) {}

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>("GET", path, undefined, init);
  }

  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>("POST", path, body, init);
  }

  patch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>("PATCH", path, body, init);
  }

  delete<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>("DELETE", path, undefined, init);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    init?: RequestInit,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
    };
    if (this.config.token) headers.Authorization = `Bearer ${this.config.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // Network failure / DNS / the backend is asleep → a uniform "unavailable" DomainError.
      // The caller renders a recoverable degraded state (FR-030); it never sees a raw throw,
      // and a failure here must never take down the public content around it.
      throw toDomainError(0);
    }

    if (!res.ok) throw await problemFrom(res);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

async function problemFrom(res: Response): Promise<DomainError> {
  let problem: Partial<ProblemJSON> | undefined;
  try {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("json")) problem = (await res.json()) as Partial<ProblemJSON>;
  } catch {
    /* non-JSON error body — fall back to status-only mapping */
  }
  return toDomainError(res.status, problem);
}
