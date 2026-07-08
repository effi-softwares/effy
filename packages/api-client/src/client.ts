import type { ProblemJSON } from "@effy/shared-types";
import { toDomainError, type DomainError } from "./errors";

/** Returns a fresh access token (or null if signed out). Injected so this package never depends
 *  on the auth library directly — Clean-Architecture direction (contracts/back-office-web §3). */
export type TokenProvider = () => Promise<string | null>;

export interface ApiClientConfig {
  baseUrl: string;
  getToken: TokenProvider;
}

/** The one authed fetch wrapper for every web surface: attaches the Bearer ACCESS token, parses
 *  problem+json, and rejects with a DomainError on non-2xx. Returns server data as-is; each
 *  feature's repo maps DTO→domain (never leaking wire shapes to screens). */
export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
      });
    } catch {
      // Network failure / CORS / offline → uniform "unavailable" (never a raw throw to the UI).
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
