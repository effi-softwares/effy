// Settings › Team and access (119): every team change, in the order research R5 sets - the record first (under the
// team lock, in one transaction, through @effy/edge-shared/team's ONE writer), then the sign-in pool as its mirror,
// then the emails, then `announce("team")`. A pool step that fails marks the person Needs attention and the answer
// says `complete: false` (FR-032); a half-done change never grants access.
import * as cognito from "@aws-sdk/client-cognito-identity-provider";

import { announce } from "@effy/edge-shared/live";
import { logger, pooled, withTransaction, type Queryable, type Transactor } from "@effy/edge-shared";
import {
  actorName,
  addMember,
  assertOrphan,
  backOfficePoolId,
  beginRepair,
  changeRole as writeRole,
  checkSignIn,
  claimInvitation,
  cognitoSignIn,
  findByEmail,
  forgetOrphan,
  issueFor,
  noteSignedOut,
  otherActiveAdmins,
  readMember,
  readMemberBySub,
  recordInvitation,
  recordRepair,
  recordSignInStep,
  removeMember,
  renameMember,
  setStatus as writeStatus,
  signInHandle,
  SignInError,
  TeamNotFoundError,
  TeamRefusalError,
  validEmail,
  validName,
  validRole,
  type Actor,
  type SignInAccount,
  type SignInPort,
  type SignInStep,
} from "@effy/edge-shared/team";
import { isLoweringRole, type BackOfficeRole, type TeamChangeDTO, type TeamMemberDetailDTO } from "@effy/shared-types";

import { teamMail, type TeamMail } from "./mail";
import { meterTeamChange } from "./metrics";

export interface TeamDeps {
  transact: Transactor;
  db: Queryable;
  port: () => SignInPort;
  mail: TeamMail;
  announce: () => Promise<void>;
  now: () => Date;
}

let cachedPort: SignInPort | undefined;

const defaults: TeamDeps = {
  transact: (fn) => withTransaction((client) => fn(client)),
  db: pooled,
  port: () => (cachedPort ??= cognitoSignIn(new cognito.CognitoIdentityProviderClient({}), backOfficePoolId(), cognito)),
  mail: teamMail,
  announce: async () => {
    await announce([{ scope: "ops", kind: "team" }]);
  },
  now: () => new Date(),
};

/** The service over `deps` (tests pass fakes; the routes use `team`). */
export function teamService(deps: TeamDeps = defaults) {
  const { transact, db } = deps;

  async function detail(staffId: string, callerSub: string): Promise<TeamMemberDetailDTO> {
    const member = await readMember(db, staffId, callerSub);
    if (!member) throw new TeamNotFoundError(staffId);
    return member;
  }

  /** One pool step after the commit, its outcome written to the record. */
  async function step(actor: Actor, staffId: string, name: SignInStep, run: () => Promise<unknown>): Promise<boolean> {
    let error: unknown = null;
    try {
      await run();
    } catch (err) {
      error = err;
      logger.error({ staffId, step: name, err: err instanceof Error ? err.message : String(err) }, "team: sign-in step failed");
    }
    return transact((tx) => recordSignInStep(tx, actor, staffId, name, error));
  }

  async function finish(action: string, staffId: string, callerSub: string, complete: boolean): Promise<TeamChangeDTO> {
    await deps.announce();
    meterTeamChange(action, complete ? "done" : "incomplete");
    return { member: await detail(staffId, callerSub), complete };
  }

  /** FR-016: every OTHER active administrator, one email each. Never throws. */
  async function tellAdmins(staffId: string, actor: Actor): Promise<void> {
    try {
      const member = await readMember(db, staffId, actor.sub);
      if (!member) return;
      const by = await actorName(db, actor.sub);
      const at = deps.now();
      for (const admin of await otherActiveAdmins(db, staffId)) {
        await deps.mail.adminGranted(admin.email, { name: member.name ?? member.email, email: member.email, actorName: by, at });
      }
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "team: admin-granted notices failed");
    }
  }

  async function sendInvitation(actor: Actor, staffId: string): Promise<void> {
    const claimed = await transact((tx) => claimInvitation(tx, actor, staffId));
    const messageId = await deps.mail.invitation(claimed.email, claimed.role);
    await transact((tx) => recordInvitation(tx, actor, staffId, messageId));
  }

  async function handleOf(staffId: string): Promise<{ handle: string; role: BackOfficeRole | null; email: string; name: string | null }> {
    const m = await readMember(db, staffId, "");
    if (!m) throw new TeamNotFoundError(staffId);
    return { handle: signInHandle(m), role: m.role, email: m.email, name: m.name };
  }

  return {
    async get(caller: Actor, staffId: string): Promise<TeamMemberDetailDTO> {
      return detail(staffId, caller.sub);
    },

    /** Route 2: add a person, or adopt an account with no record (contracts/team-api.md "Add in detail"). */
    async add(caller: Actor, body: Record<string, unknown>): Promise<TeamChangeDTO> {
      const email = validEmail(body.email);
      const name = validName(body.name);
      const role = validRole(body.role);
      const invite = body.invite !== false;

      // Refused before the pool is touched, so a refused add leaves nothing behind. Asked again under the lock.
      const existing = await findByEmail(db, email);
      if (existing?.status === "active") throw new TeamRefusalError("already_on_team", { memberId: existing.id });
      if (existing?.status === "disabled") throw new TeamRefusalError("disabled_on_team", { memberId: existing.id });

      const account = await deps.port().create(email, name);
      const { staffId } = await transact((tx) =>
        addMember(tx, caller, { email, name, role, sub: account.sub, adopted: account.adopted, invite }),
      );

      let complete = await step(caller, staffId, "group", () => deps.port().setGroup(account.username, role));
      if (!account.enabled) complete = (await step(caller, staffId, "enable", () => deps.port().enable(account.username))) && complete;
      if (invite) await sendInvitation(caller, staffId);
      if (role === "admin") await tellAdmins(staffId, caller);
      return finish("add", staffId, caller.sub, complete);
    },

    /** Route 8: disable or re-enable. */
    async setStatus(caller: Actor, staffId: string, body: Record<string, unknown>): Promise<TeamChangeDTO> {
      const to = body.status === "active" || body.status === "disabled" ? body.status : null;
      if (!to) throw new TeamRefusalError("staff_changed");
      const role = body.role === undefined || body.role === null ? undefined : validRole(body.role);
      const outcome = await transact((tx) =>
        writeStatus(tx, caller, staffId, to, { expectedRevision: revision(body.expectedRevision), role }),
      );
      const { handle } = await handleOf(staffId);
      const port = deps.port();
      let complete: boolean;
      if (to === "disabled") {
        complete = await step(caller, staffId, "disable", () => port.disable(handle));
        complete = (await step(caller, staffId, "sign_out", () => port.globalSignOut(handle))) && complete;
      } else {
        complete = await step(caller, staffId, "enable", () => port.enable(handle));
        complete = (await step(caller, staffId, "group", () => port.setGroup(handle, outcome.role))) && complete;
        if (outcome.role === "admin") await tellAdmins(staffId, caller);
      }
      return finish(to === "disabled" ? "disable" : "enable", staffId, caller.sub, complete);
    },

    /** Route 7: one role, in force on the next request; a lowered role also signs out everywhere (FR-015). */
    async changeRole(caller: Actor, staffId: string, body: Record<string, unknown>): Promise<TeamChangeDTO> {
      const role = validRole(body.role);
      const outcome = await transact((tx) => writeRole(tx, caller, staffId, role, revision(body.expectedRevision)));
      if (!outcome.changed) return finish("role", staffId, caller.sub, true);
      const { handle } = await handleOf(staffId);
      let complete = await step(caller, staffId, "group", () => deps.port().setGroup(handle, role));
      if (isLoweringRole(outcome.from, outcome.to)) {
        complete = (await step(caller, staffId, "sign_out", () => deps.port().globalSignOut(handle))) && complete;
      }
      if (outcome.to === "admin") await tellAdmins(staffId, caller);
      return finish("role", staffId, caller.sub, complete);
    },

    /** Route 9: a disabled person is removed; the record stays (FR-019). */
    async remove(caller: Actor, staffId: string, expectedRevision: unknown): Promise<TeamChangeDTO> {
      await transact((tx) => removeMember(tx, caller, staffId, revision(expectedRevision)));
      const { handle } = await handleOf(staffId);
      const complete = await step(caller, staffId, "delete", () => deps.port().delete(handle));
      return finish("remove", staffId, caller.sub, complete);
    },

    /** Route 10: recorded first; if the pool then fails the route says so (502), access is unchanged either way. */
    async signOut(caller: Actor, staffId: string): Promise<TeamChangeDTO> {
      const { email } = await transact((tx) => noteSignedOut(tx, caller, staffId));
      try {
        await deps.port().globalSignOut(signInHandle({ email }));
      } catch (err) {
        logger.error({ staffId, err: err instanceof Error ? err.message : String(err) }, "team: global sign-out failed");
        await deps.announce();
        meterTeamChange("sign_out", "incomplete");
        throw new TeamRefusalError("sign_in_unavailable");
      }
      return finish("sign_out", staffId, caller.sub, true);
    },

    /** Route 11: at most once per five minutes per person (FR-013). */
    async invite(caller: Actor, staffId: string): Promise<TeamChangeDTO> {
      await sendInvitation(caller, staffId);
      return finish("invite", staffId, caller.sub, true);
    },

    /** Route 6: an Administrator renames anyone. */
    async rename(caller: Actor, staffId: string, body: Record<string, unknown>): Promise<TeamChangeDTO> {
      await transact((tx) => renameMember(tx, caller, staffId, String(body.name ?? ""), revision(body.expectedRevision)));
      return finish("rename", staffId, caller.sub, true);
    },

    /** Route 14: any ACTIVE person renames themselves (FR-003). */
    async renameSelf(caller: Actor, body: Record<string, unknown>): Promise<TeamChangeDTO | null> {
      const me = await readMemberBySub(db, caller.sub);
      if (!me || me.status !== "active") return null;
      await transact((tx) => renameMember(tx, caller, me.id, String(body.name ?? "")));
      return finish("rename", me.id, caller.sub, true);
    },

    /** Route 12: make the sign-in account match the record (FR-031). */
    async repair(caller: Actor, staffId: string, body: Record<string, unknown>): Promise<TeamChangeDTO> {
      const member = await transact((tx) => beginRepair(tx, caller, staffId, revision(body.expectedRevision)));
      const port = deps.port();
      const handle = signInHandle(member);
      const steps: string[] = [];
      let complete = true;
      let newSub: string | undefined;
      let email: string | undefined;

      const run = async (name: SignInStep, word: string, fn: () => Promise<unknown>) => {
        const ok = await step(caller, staffId, name, fn);
        if (ok) steps.push(word);
        complete = complete && ok;
      };

      let account: SignInAccount | null = null;
      try {
        account = (await port.get(handle)) ?? (await port.get(member.subject));
      } catch (err) {
        throw err instanceof SignInError ? new TeamRefusalError("sign_in_unavailable") : err;
      }

      if (member.status === "active") {
        if (!account) {
          await run("create", "created the sign-in account", async () => {
            const made = await port.create(member.email, member.name ?? member.email);
            account = made;
            newSub = made.sub;
          });
        }
        const acc = account as SignInAccount | null;
        if (acc && !acc.enabled) await run("enable", "turned sign-in on", () => port.enable(acc.username));
        if (acc && member.role && (acc.groups.length !== 1 || acc.groups[0] !== member.role)) {
          await run("group", "set the group", () => port.setGroup(acc.username, member.role));
        }
        if (acc?.email && acc.email !== member.email) {
          email = acc.email;
          steps.push("copied the email");
        }
      } else if (account) {
        const acc = account as SignInAccount;
        if (member.status === "removed") {
          await run("delete", "deleted the sign-in account", () => port.delete(acc.username));
        } else if (acc.enabled) {
          await run("disable", "turned sign-in off", () => port.disable(acc.username));
          await run("sign_out", "signed out everywhere", () => port.globalSignOut(acc.username));
        }
      }

      // What still disagrees, read back from the pool.
      let after = member.signInIssue;
      try {
        const now = (newSub ? await port.get(member.email) : null) ?? (await port.get(handle)) ?? (await port.get(newSub ?? member.subject));
        after = issueFor(
          { id: member.id, subject: newSub ?? member.subject, email: email ?? member.email, status: member.status, role: member.role },
          now,
        );
      } catch {
        complete = false;
      }
      await transact((tx) => recordRepair(tx, caller, staffId, { issue: member.signInIssue, steps, sub: newSub, email, after }));
      return finish("repair", staffId, caller.sub, complete && after === null);
    },

    /** Route 3: compare the pool with every record (skipped within 60 seconds). */
    async checkSignIn(): Promise<{ checked: boolean }> {
      const result = await checkSignIn(transact, deps.port());
      if (!result.skipped) await deps.announce();
      return { checked: !result.skipped };
    },

    /** Route 4: delete a sign-in account that has no record. */
    async deleteOrphan(caller: Actor, username: string): Promise<void> {
      const orphan = await transact((tx) => assertOrphan(tx, username));
      try {
        await deps.port().delete(orphan.username);
      } catch (err) {
        throw err instanceof SignInError ? new TeamRefusalError("sign_in_unavailable") : err;
      }
      await transact((tx) => forgetOrphan(tx, caller, orphan));
      await deps.announce();
      meterTeamChange("orphan_deleted", "done");
    },
  };
}

function revision(raw: unknown): number | undefined {
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isInteger(n) && n > 0 ? n : undefined;
}

export type TeamService = ReturnType<typeof teamService>;

/** The service the routes use. */
export const team: TeamService = teamService();
