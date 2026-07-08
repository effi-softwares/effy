import type { ProblemJSON } from "@effy/shared-types";

export type DomainErrorKind =
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "unsupported-version"
  | "unavailable"
  | "unknown";

/** The console's single error abstraction. The UI keys human-readable states off `kind` and
 *  NEVER shows raw `detail`/stack/token to the user (FR-008). */
export interface DomainError {
  kind: DomainErrorKind;
  status: number;
  title: string;
  detail?: string;
}

export function toDomainError(status: number, problem?: Partial<ProblemJSON>): DomainError {
  const kind = kindForStatus(status, problem?.type);
  return {
    kind,
    status,
    title: problem?.title ?? defaultTitle(kind),
    detail: problem?.detail,
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
