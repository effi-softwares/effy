import type { ProblemFieldIssue, ProblemJSON } from "@effy/shared-types";

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
  /**
   * Field issues, or (032) stable refusal codes, carried through from the problem document.
   *
   * ⚠ Surfacing these is NOT the same as showing raw `detail`, which FR-008 forbids. `detail` is
   * free-form server prose that can leak internals; a `field` is a value the API contract defines on
   * purpose, and the console maps it to its OWN copy. Never render `message` verbatim.
   */
  fields?: ProblemFieldIssue[];
}

export function toDomainError(status: number, problem?: Partial<ProblemJSON>): DomainError {
  const kind = kindForStatus(status, problem?.type);
  return {
    kind,
    status,
    title: problem?.title ?? defaultTitle(kind),
    detail: problem?.detail,
    // ⚠ THE WIRE KEY IS `errors`, NOT `fields`. `@effy/edge-shared`'s `problem()` serialises field
    // issues under `errors`; this reader only ever looked at `fields`, so `DomainError.fields` was
    // undefined on EVERY refusal, platform-wide, since the type was introduced. 053 found it and
    // recorded it as latent (see its SIGNOFF and back-office/orders/errorText.ts); 054 needs it,
    // because a validation refusal that cannot say WHICH field is wrong is a generic sentence.
    // Both keys are accepted so a service serialising either shape is understood.
    fields: Array.isArray(problem?.errors)
      ? problem.errors
      : Array.isArray(problem?.fields)
        ? problem.fields
        : undefined,
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
