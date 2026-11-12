// 115: the ONE check of a message's words, used by the admin service (messages and automatic messages) and the
// notifications worker before it creates an automatic run. Pure: it returns the problem, the caller decides how to say it.
import {
  hasFirstNamePlaceholder,
  messageKind,
  messageNamesEffy,
  MESSAGE_MUST_NAME_EFFY,
  NAME_FALLBACK_LIMIT,
  TITLE_HAS_NAME,
  validNameFallback,
  type MessageKind,
  type NotificationAudience,
} from "@effy/shared-types";

export interface MessageWordsInput {
  kind: MessageKind;
  title: string;
  body: string;
  nameFallback: string;
  email: boolean;
  audiences: readonly NotificationAudience[];
}

export interface WordsProblem {
  field: "title" | "body" | "nameFallback" | "email";
  code: "title_has_name" | "invalid_fallback" | "email_customers_only" | "message_must_name_effy";
  message: string;
}

/**
 * `draft: true` for a message being saved (112): it may not name Effy yet - that is checked when it is tested or sent,
 * and when an automatic message is saved (it sends with nobody checking it first).
 */
export function checkMessageWords(m: MessageWordsInput, opts: { draft?: boolean } = {}): WordsProblem | null {
  if (hasFirstNamePlaceholder(m.title)) return { field: "title", code: "title_has_name", message: TITLE_HAS_NAME };
  if (!validNameFallback(m.nameFallback)) {
    return {
      field: "nameFallback",
      code: "invalid_fallback",
      message: `The word used when someone has no first name: 1 to ${NAME_FALLBACK_LIMIT} characters, no { } or |.`,
    };
  }
  if (m.email && m.audiences.some((a) => a !== "customer")) {
    return { field: "email", code: "email_customers_only", message: "Email goes to customers only." };
  }
  if (!opts.draft && messageKind(m.kind)?.marketing && !messageNamesEffy(m.title, m.body)) {
    return { field: "body", code: "message_must_name_effy", message: MESSAGE_MUST_NAME_EFFY };
  }
  return null;
}
