// Taking a back-office message back (112 R8). Effy's own withdrawal, not the person's archive: every recipient's item
// ends now, so the inbox stops listing it (110's LISTED rule) and the drain abandons any push not yet sent - queued or
// held for the night - as `expired` (109). No delivery outcome is written here; the drain stays their one writer.
// Called inside the withdraw route's transaction; open inboxes are told by the sending worker's next pass.
import type { Queryable } from "../../lib/db";

/** How many items it ended. */
export async function withdrawMessageItems(tx: Queryable, messageId: string): Promise<number> {
  const res = await tx.query(
    `UPDATE public.notification SET expires_at = now()
      WHERE message_id = $1 AND (expires_at IS NULL OR expires_at > now())`,
    [messageId],
  );
  return res.rowCount ?? 0;
}
