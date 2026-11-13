// The team's two emails (research R9), through @effy/email-kit as the back-office audience. The back-office address is
// REQUIRED (`BACK_OFFICE_URL`, from Terraform's own output): never a guessed default.
import { sendEmail } from "@effy/email-kit/send";
import { logger } from "@effy/edge-shared";
import { OPERATING_TZ, TEAM_ROLE_WORDS, type BackOfficeRole } from "@effy/shared-types";

export interface TeamMail {
  /** The mail id (delivery is read by it), or null when the send failed. */
  invitation(to: string, role: BackOfficeRole): Promise<string | null>;
  /** "{name} was made an Administrator by {actorName} at {when}" to one other administrator. Never throws. */
  adminGranted(to: string, vars: { name: string; email: string; actorName: string; at: Date }): Promise<void>;
}

export function backOfficeUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.BACK_OFFICE_URL;
  if (!url) throw new Error("BACK_OFFICE_URL is not set (SSM /effy/<env>/web/back_office_url)");
  return url;
}

const WHEN = new Intl.DateTimeFormat("en-AU", { timeZone: OPERATING_TZ, dateStyle: "medium", timeStyle: "short" });

export const teamMail: TeamMail = {
  async invitation(to, role) {
    try {
      const sent = await sendEmail(
        "staff-invitation",
        { role: TEAM_ROLE_WORDS[role], backOfficeUrl: backOfficeUrl() },
        { to, audience: "back-office" },
        logger,
      );
      return sent.outcome === "sent" ? (sent.messageId ?? null) : null;
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "team: invitation not sent");
      return null;
    }
  },

  async adminGranted(to, vars) {
    try {
      await sendEmail(
        "staff-admin-granted",
        { name: vars.name, email: vars.email, actorName: vars.actorName, when: WHEN.format(vars.at), backOfficeUrl: backOfficeUrl() },
        { to, audience: "back-office" },
        logger,
      );
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "team: admin-granted notice not sent");
    }
  },
};
