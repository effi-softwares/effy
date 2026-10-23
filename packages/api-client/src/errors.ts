import type { ProblemFieldIssue, ProblemJSON } from "@effy/shared-types";

export type DomainErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "unsupported-version"
  | "unavailable"
  | "unknown";

/** The single client error. The UI keys its states off `kind` and never shows raw `detail`,
 *  stack or token. */
export interface DomainError {
  kind: DomainErrorKind;
  status: number;
  title: string;
  detail?: string;
  /** Field issues or refusal codes: contract values the UI maps to its own copy, never rendered verbatim. */
  fields?: ProblemFieldIssue[];
  /** The problem's `type` URI (e.g. `…/problems/name-taken`): tells two 400s apart. Never shown. */
  type?: string;
  /** The problem's `code`, when the route defines one. Never shown. */
  code?: string;
}

export function toDomainError(status: number, problem?: Partial<ProblemJSON>): DomainError {
  const kind = kindForStatus(status, problem?.type);
  return {
    kind,
    status,
    title: problem?.title ?? defaultTitle(kind),
    detail: problem?.detail,
    type: typeof problem?.type === "string" ? problem.type : undefined,
    code: typeof problem?.code === "string" ? problem.code : undefined,
    // The wire key is `errors`; the domain calls them `fields`.
    fields: Array.isArray(problem?.errors) ? problem.errors : undefined,
  };
}

export function isDomainError(err: unknown): err is DomainError {
  return (
    typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    "status" in err
  );
}

function kindForStatus(status: number, type?: string): DomainErrorKind {
  if (type && type.includes("unsupported-version")) return "unsupported-version";
  switch (status) {
    case 401:
      return "unauthenticated";
    case 403:
      return "forbidden";
    case 404:
      return "not-found";
    default:
      if (status === 0 || status >= 500) return "unavailable";
      return "unknown";
  }
}

function defaultTitle(kind: DomainErrorKind): string {
  switch (kind) {
    case "unauthenticated":
      return "Sign-in required";
    case "forbidden":
      return "Access denied";
    case "not-found":
      return "Not found";
    case "unsupported-version":
      return "Unsupported version";
    case "unavailable":
      return "Service unavailable";
    default:
      return "Something went wrong";
  }
}
