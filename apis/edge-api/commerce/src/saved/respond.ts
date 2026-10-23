// A refusal's reason is the last segment of the problem `type`, which clients switch on.
import {
  ConnectionLimitError, internal, noContent, notFound, refused, type RequestScope,
} from "@effy/edge-shared";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";

import { InvalidListNameError, ListNameTakenError } from "./list-name";
import {
  CapReachedError, DefaultListError, InNamedListsError, ListLimitError, ListNotFoundError, ProductNotFoundError,
} from "./repository";

export async function noContentOr(scope: RequestScope, work: () => Promise<void>): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    await work();
    return noContent(scope);
  } catch (err) {
    return savedError(scope, err, "write");
  }
}

export function savedError(scope: RequestScope, err: unknown, what: string): APIGatewayProxyStructuredResultV2 {
  if (err instanceof ConnectionLimitError) throw err;

  if (err instanceof ProductNotFoundError) return notFound(scope);
  if (err instanceof CapReachedError) {
    return refused(scope, 400, "saved_items_cap_reached",
      "You have reached the maximum number of saved items. Remove one to save another.");
  }
  if (err instanceof InNamedListsError) {
    // Nothing was removed; the client opens the list chooser.
    return refused(scope, 409, "in_named_lists",
      "This item is in one of your lists. Remove it from the list to stop saving it.");
  }
  if (err instanceof ListNotFoundError) return refused(scope, 404, "list_not_found", "That list no longer exists.");
  if (err instanceof ListNameTakenError) return refused(scope, 409, "name_taken", "You already have a list with that name.");
  if (err instanceof InvalidListNameError) return refused(scope, 400, "invalid_name", "A list name must be 1 to 40 characters.");
  if (err instanceof ListLimitError) return refused(scope, 400, "list_limit", "You have reached the maximum number of lists.");
  if (err instanceof DefaultListError) return refused(scope, 400, "default_list", "This list cannot be renamed or deleted.");

  // A list name is the shopper's own text and is never logged.
  scope.log.error({ err }, `saveditems: ${what} failed`);
  return internal(scope);
}

export function badBody(scope: RequestScope, code: string): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: 400,
    headers: { "content-type": "application/json", "x-request-id": scope.requestId },
    body: JSON.stringify({ error: code }),
  };
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function parseRfc3339(v: unknown): Date | null {
  if (typeof v !== "string" || !RFC3339.test(v)) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
