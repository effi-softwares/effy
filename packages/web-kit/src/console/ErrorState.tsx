import { isDomainError, type DomainError } from "@effy/api-client";
import { Button } from "@effy/design-system/ui";

/**
 * The client error contract, rendered: a human state keyed on `DomainError.kind` only, never the raw
 * `detail`, status, stack or credentials. `unavailable` covers a slow first wake and an unreachable
 * backend alike, with a Retry.
 */
export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** Overrides the default copy for a given kind (e.g. a screen-specific denial message). */
  forbiddenMessage?: string;
}

interface Copy {
  title: string;
  body: string;
  retryable: boolean;
}

function copyFor(error: DomainError, forbiddenMessage?: string): Copy {
  switch (error.kind) {
    case "unauthenticated":
      return {
        title: "Your session has expired",
        body: "Sign in again to continue.",
        retryable: false,
      };
    case "forbidden":
      return {
        title: "Access denied",
        body: forbiddenMessage ?? "Your account doesn't have access to this area.",
        retryable: false,
      };
    case "not-found":
      return { title: "Not found", body: "That resource doesn't exist.", retryable: false };
    case "unavailable":
      return {
        title: "Service unavailable",
        body: "The service is waking up or unreachable. Try again in a moment.",
        retryable: true,
      };
    default:
      return { title: "Something went wrong", body: "Please try again.", retryable: true };
  }
}

export function ErrorState({ error, onRetry, forbiddenMessage }: ErrorStateProps) {
  const domain: DomainError = isDomainError(error)
    ? error
    : { kind: "unknown", status: 0, title: "Something went wrong" };

  const { title, body, retryable } = copyFor(domain, forbiddenMessage);

  return (
    <div className="space-y-3 rounded-lg border p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{body}</p>
      {retryable && onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
