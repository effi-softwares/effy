import type { ProblemJSON } from "@effy/shared-types";
import { toDomainError, type DomainError } from "./errors";

/** Returns a fresh access token, or null if signed out. Injected so this package never depends on the auth library. */
export type TokenProvider = () => Promise<string | null>;

export interface ApiClientConfig {
  baseUrl: string;
  getToken: TokenProvider;
}

/** The authed fetch wrapper for every web surface: attaches the Bearer access token, parses
 *  problem+json and rejects with a DomainError on non-2xx. Each feature's repo maps DTO to domain. */
export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  /** `signal` cancels a read that has been superseded (a list's next search), so a stale answer never lands. */
  get<T>(path: string, opts: { signal?: AbortSignal } = {}): Promise<T> {
    return this.request<T>("GET", path, undefined, opts.signal);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  /** Replaces a resource wholesale: an idempotent write, so a retry cannot mean something else. */
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const token = await this.config.getToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (err) {
      // Cancelled by the caller: rethrown as-is, so the server-state cache treats it as cancelled, not failed.
      if (signal?.aborted) throw err;
      // Network failure, CORS or offline: a uniform "unavailable".
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
