import type { ProblemJSON } from "@effy/shared-types";
import { toDomainError, type DomainError } from "./errors";

/**
 * The server-side API client. The token is injected (already resolved from cookies) and framework cache
 * options pass through as an opaque `RequestInit` (the storefront sends `{ next: { tags, revalidate } }`).
 * No Next.js import: Vite SPAs use this package too.
 */
export interface ServerApiClientConfig {
  baseUrl: string;
  /** Already-resolved bearer token, or null for an anonymous (public) read. */
  token?: string | null;

  /**
   * The customer's access token, for account routes that call Cognito (ChangePassword, GlobalSignOut,
   * attribute verification); `token` is the ID token the gateway checks. The backend refuses a request
   * whose access-token `sub` differs from the verified one; never send this to a service that does not.
   */
  accessToken?: string | null;
}

/** The header the platform carries the access token on. Must match the backend's constant. */
const ACCESS_TOKEN_HEADER = "X-Effy-Access-Token";

export class ServerApiClient {
  constructor(private readonly config: ServerApiClientConfig) {}

  get<T>(path: string, init?: RequestInit): Promise<T> {
    return this.request<T>("GET", path, undefined, init);
  }

  post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>("POST", path, body, init);
  }

  put<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
    return this.request<T>("PUT", path, body, init);
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
    if (this.config.accessToken) headers[ACCESS_TOKEN_HEADER] = this.config.accessToken;
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
      // Network failure, DNS, or a cold backend: a uniform "unavailable"; the caller renders a degraded state.
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
    /* non-JSON error body: status-only mapping */
  }
  return toDomainError(res.status, problem);
}
