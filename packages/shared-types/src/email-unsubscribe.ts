// 115 (backlog E11): the unsubscribe link in every marketing email. Public (no sign-in); a wrong token answers the same
// shape and changes nothing. Contract: specs/115-messages-email-automation/contracts/routes.md.

/** `POST /customer/v1/email-unsubscribe` and `/undo`. */
export interface EmailUnsubscribeRequest {
  token: string;
  /** The message whose email held the link, for its report. */
  messageId?: string | null;
}

export interface EmailUnsubscribeResponse {
  ok: boolean;
  /** Undo is offered for 7 days after an unsubscribe. */
  undoable: boolean;
}

/** How long Undo works after an unsubscribe (FR-005). */
export const UNSUBSCRIBE_UNDO_DAYS = 7;

/** The page's words, the same on every path to it. */
export const UNSUBSCRIBE_WORDS = {
  done: "You won't get offers and news by email any more.",
  doneDetail: "Your inbox and phone notifications are unchanged. You can turn email back on in your notification settings.",
  undo: "Undo",
  undone: "Email for offers and news is back on.",
  failed: "That link didn't work.",
  failedDetail: "It may be old or incomplete. You can change what Effy emails you in your notification settings.",
} as const;
