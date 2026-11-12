// A customer's marketing consent history (111 US7), as an activity log (104): every yes and no, when, where and which
// wording. Read only; the one writer is @effy/edge-shared/notifications preferences.ts. Staff cannot change it.
import { activityFact, type ActivityRow, type ActivitySource } from "@effy/edge-shared";

// 115: an answer about EMAIL (channel 'email') is its own action - offers by email is a separate yes from offers.
const ACTION_WORDS: Record<string, string> = {
  "yes:offers": "Said yes to offers",
  "no:offers": "Said no to offers",
  "yes:news": "Said yes to news",
  "no:news": "Said no to news",
  "yes:offers:email": "Said yes to offers by email",
  "no:offers:email": "Said no to offers by email",
  "yes:news:email": "Said yes to news by email",
  "no:news:email": "Said no to news by email",
};

const SURFACE_WORDS: Record<string, string> = { app: "In the app", web: "On the website", email: "From an email" };
const VIA_WORDS: Record<string, string> = {
  prompt: "on the order confirmation",
  settings: "in Notification settings",
  inbox: "from an offer in their inbox",
  email_link: "through the unsubscribe link",
  one_click: "with their mail program's unsubscribe button",
};

function entry(r: ActivityRow) {
  const surface = SURFACE_WORDS[activityFact(r, "surface") ?? ""] ?? "Somewhere";
  const via = VIA_WORDS[activityFact(r, "via") ?? ""] ?? "";
  return {
    title: ACTION_WORDS[r.action] ?? r.action,
    detail: `${surface}${via ? `, ${via}` : ""}. Wording ${activityFact(r, "wording") ?? "?"}`,
    tone: r.kind === "yes" ? ("done" as const) : ("default" as const),
  };
}

export function consentActivitySource(customerId: string): ActivitySource {
  return {
    sql: `
      SELECT c.id::text AS id, c.created_at AS at,
             CASE WHEN c.granted THEN 'yes' ELSE 'no' END AS kind,
             (CASE WHEN c.granted THEN 'yes' ELSE 'no' END) || ':' || c.category
               || CASE WHEN c.channel = 'email' THEN ':email' ELSE '' END AS action,
             'Customer'::text AS actor,
             concat_ws(' ', c.category, c.channel, c.surface, c.via, c.wording_version) AS search_text,
             jsonb_build_object('surface', c.surface, 'via', c.via, 'wording', c.wording_version) AS facts
        FROM public.customer_marketing_consent c
       WHERE c.customer_id = $1::uuid`,
    args: [customerId],
    actionWords: ACTION_WORDS,
    entry,
  };
}
