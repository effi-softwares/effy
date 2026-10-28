import { isDomainError } from "@effy/api-client";
import { CAPPED_SET_LIMIT, listFullSentence } from "@effy/shared-types";

/**
 * A create refused because its set is full (103 FR-024: 409 `limit_reached`): the server's one sentence, or
 * null for any other error. Every create of a capped set asks this before its own wording.
 */
export function setFullText(err: unknown): string | null {
  if (!isDomainError(err) || err.status !== 409) return null;
  const sentence = listFullSentence(CAPPED_SET_LIMIT);
  return err.detail === sentence || err.type?.endsWith("/limit-reached") || err.type?.endsWith("/limit_reached") ? sentence : null;
}
