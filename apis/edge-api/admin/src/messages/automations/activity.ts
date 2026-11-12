// An automatic message's activity (115 FR-020): every change, and when it ran out of schedule; one log in the drawer (104).
import { staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared";

import { MessageError } from "../errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const WORDS: Record<string, string> = {
  created: "Set up",
  edited: "Edited",
  paused: "Paused",
  resumed: "Resumed",
  ended: "Ended",
  finished: "Finished its schedule",
};

function entry(r: ActivityRow) {
  const title = WORDS[r.action] ?? "Changed";
  switch (r.action) {
    case "created":
      return { title, tone: "primary" as const };
    case "edited":
      return { title, detail: r.facts?.triggerChanged ? "The trigger changed: it looks only from now on" : null };
    case "resumed":
      return { title, tone: "primary" as const, detail: "Nothing missed while paused is sent" };
    case "paused":
    case "ended":
      return { title, tone: "problem" as const };
    case "finished":
      return { title, tone: "done" as const };
    default:
      return { title };
  }
}

export function automationActivitySource(id: string): ActivitySource {
  if (!UUID.test(id)) throw new MessageError(404, "automation_not_found", "automatic message not found");
  return {
    sql: `
      SELECT e.id::text AS id, e.created_at AS at, e.kind AS kind, e.kind AS action,
             CASE WHEN e.actor_sub = 'system' THEN 'Effy' ELSE ${staffNameSql("e.actor_sub")} END AS actor,
             e.facts::text AS search_text,
             e.facts AS facts
        FROM public.message_automation_event e
       WHERE e.automation_id = $1::uuid`,
    args: [id],
    actionWords: WORDS,
    entry,
  };
}
