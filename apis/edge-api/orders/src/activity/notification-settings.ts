// The promotion limits' changes (111 US3), as an activity log (104). Read only: written by notification-settings/.
import { activityFact, staffNameSql, type ActivityRow, type ActivitySource } from "@effy/edge-shared";

const FIELD_WORDS: Record<string, string> = {
  promoPushPerDay: "Promotional notifications per day",
  promoPushPerWeek: "Promotional notifications per week",
};

function entry(r: ActivityRow) {
  return {
    title: `${FIELD_WORDS[r.action] ?? r.action} changed`,
    detail: `${activityFact(r, "from") ?? "?"} → ${activityFact(r, "to") ?? "?"}`,
  };
}

export function notificationSettingsActivitySource(): ActivitySource {
  return {
    sql: `
      SELECT c.id::text AS id, c.changed_at AS at, 'limits'::text AS kind, c.field AS action,
             ${staffNameSql("c.changed_by")} AS actor,
             concat_ws(' ', c.old_value, c.new_value) AS search_text,
             jsonb_build_object('from', c.old_value, 'to', c.new_value) AS facts
        FROM public.notification_settings_change c`,
    args: [],
    actionWords: Object.fromEntries(Object.entries(FIELD_WORDS).map(([k, w]) => [k, `${w} changed`])),
    entry,
  };
}
