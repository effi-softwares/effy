import { isDomainError, type DomainError } from "@effy/api-client";
import { Button } from "@effy/design-system/ui";

/**
 * The single client error-handling contract, rendered.
 *
 * Every backend failure reaches the operator through here. The raw `detail`, the status code, the
 * stack, and any credential material stay out of the DOM — a screen renders a human state keyed on
 * `DomainError.kind` and nothing else.
 *
 * `unavailable` is not a bug: the cost-optimized backend is allowed to be slow on first wake, so
 * "waking up" and "unreachable" share one recoverable state with a Retry.
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
