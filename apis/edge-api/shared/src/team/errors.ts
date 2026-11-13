import { TEAM_REFUSAL_SENTENCE, type TeamRefusal } from "@effy/shared-types";

/** A team change the rules refuse. Nothing was written. The handler maps it to its status with the spec's sentence. */
export class TeamRefusalError extends Error {
  constructor(
    readonly type: TeamRefusal,
    readonly extra?: Record<string, unknown>,
  ) {
    super(TEAM_REFUSAL_SENTENCE[type]);
    this.name = "TeamRefusalError";
  }
}

/** The request itself is wrong (a name too long, an email with no shape). */
export class TeamValidationError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "TeamValidationError";
  }
}

/** No such team member. */
export class TeamNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`no team member ${id}`);
    this.name = "TeamNotFoundError";
  }
}

/** HTTP status per refusal (contracts/team-api.md). */
export const TEAM_REFUSAL_STATUS: Readonly<Record<TeamRefusal, number>> = {
  already_on_team: 409,
  disabled_on_team: 409,
  last_admin: 409,
  not_yourself: 409,
  staff_changed: 409,
  not_active: 409,
  not_disabled: 409,
  role_required: 400,
  invited_recently: 409,
  has_record: 409,
  sign_in_unavailable: 502,
};
