import { useState, type ReactNode } from "react"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  SIGN_IN_ISSUE_WORDS,
  TEAM_REFUSAL_WORDS,
  TEAM_ROLE_WORDS,
  TEAM_STATUS_WORDS,
  type TeamMemberDetailDTO,
  type TeamStatus,
} from "@effy/shared-types"
import { Button, toast } from "@effy/design-system/ui"
import { ActivityButton, ActivityLogDrawer } from "@effy/web-kit/activity-log"
import { ErrorState } from "@effy/web-kit/console"
import { DetailPageSkeleton, DetailRowsSkeleton, PageHeader, Panel, PanelSkeleton, StatusWord } from "@effy/web-kit/patterns"
import { tourStatus, useTourPage } from "@effy/web-kit/tour"

import { api } from "@/lib/api"
import { moment } from "@/lib/format"
import { track } from "@/lib/telemetry"

import { teamErrorText, useTeamChange } from "./changes"
import { ChangeRoleDialog } from "./dialogs/ChangeRoleDialog"
import { DisableDialog } from "./dialogs/DisableDialog"
import { ReenableDialog } from "./dialogs/ReenableDialog"
import { RemoveDialog } from "./dialogs/RemoveDialog"
import { RenameDialog } from "./dialogs/RenameDialog"
import { SignOutDialog } from "./dialogs/SignOutDialog"
import { memberQuery, TEAM_ROOT } from "./queries"
import { memberActivityPath, renameMember, repairMember, sendInvitation } from "./repo"

const BACK = { label: "Team and access", link: { to: "/settings/team" } } as const
const DETAIL_LABELS = ["Role", "Status", "Added", "Last seen", "Last invitation", "Disabled", "Removed"]

/** A team member's status, with Needs attention beside it when their sign-in account disagrees. */
export function MemberStatus({ status, attention }: { status: TeamStatus; attention: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <StatusWord tone={status === "active" ? "done" : "quiet"}>{TEAM_STATUS_WORDS[status]}</StatusWord>
      {attention ? <StatusWord tone="waiting">{TEAM_STATUS_WORDS.attention}</StatusWord> : null}
    </span>
  )
}

const DELIVERY_WORDS = {
  sent: "Sent",
  delivered: "Delivered",
  bounced: "Not delivered",
  complained: "Not delivered (reported as spam)",
  failed: "Not sent",
} as const

/** Settings › Team and access › a team member (119): who they are, their access, and what may be done about it. */
export function PersonScreen({ staffId }: { staffId: string }) {
  const query = useQuery(memberQuery(staffId))
  useTourPage("admin-person", { status: tourStatus(query) })
  const [reenable, setReenable] = useState(false)

  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        forbiddenMessage="Only an administrator can see the team."
      />
    )
  }
  if (query.isPending) {
    return (
      <DetailPageSkeleton
        back={BACK}
        label="Loading this person"
        actions={3}
        main={
          <PanelSkeleton title="Details">
            <DetailRowsSkeleton tight labels={DETAIL_LABELS} />
          </PanelSkeleton>
        }
        aside={null}
      />
    )
  }

  const m = query.data
  const can = (a: TeamMemberDetailDTO["actions"][number]) => m.actions.includes(a)
  const who = m.name ?? m.email

  return (
    <>
      <div data-tour="person.head">
        <PageHeader
          back={BACK}
          title={
            <>
              <span className="break-all">{who}</span>
              <MemberStatus status={m.status} attention={m.signInIssue !== null} />
            </>
          }
          description={m.name ? m.email : undefined}
          actions={
            <>
              {can("role") ? <ChangeRoleDialog member={m} /> : null}
              {can("invite") ? <InviteButton member={m} /> : null}
              {can("disable") ? <DisableDialog member={m} /> : null}
              {can("enable") ? (
                <Button variant="outline" onClick={() => setReenable(true)}>
                  Re-enable
                </Button>
              ) : null}
              {can("remove") ? <RemoveDialog member={m} /> : null}
              {can("sign_out") ? <SignOutDialog member={m} /> : null}
              {can("repair") ? <RepairButton member={m} /> : null}
              <ActivityButton />
            </>
          }
        />
      </div>

      <div className="max-w-220 space-y-6">
        {m.isYou ? <p className="text-sm text-muted-foreground">{TEAM_REFUSAL_WORDS.notYourself}</p> : null}

        {m.signInIssue ? (
          <Panel title="Needs attention" description={SIGN_IN_ISSUE_WORDS[m.signInIssue].sentence}>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StatusWord tone="waiting">{SIGN_IN_ISSUE_WORDS[m.signInIssue].short}</StatusWord>
              {can("repair") ? <RepairButton member={m} /> : null}
            </div>
          </Panel>
        ) : null}

        <Panel title="Details">
          <dl className="ef-dl ef-dl--tight">
            <Row label="Name">
              <span className="flex flex-wrap items-center gap-3">
                {m.name ?? <span className="text-muted-foreground">No name yet</span>}
                {can("rename") ? (
                  <RenameDialog current={m.name} run={(name) => renameMember(m.id, name, m.revision)} />
                ) : null}
              </span>
            </Row>
            <Row label="Email">{m.email}</Row>
            <Row label="Role">{m.role ? TEAM_ROLE_WORDS[m.role] : <span className="text-muted-foreground">No role</span>}</Row>
            <Row label="Status">
              <MemberStatus status={m.status} attention={m.signInIssue !== null} />
            </Row>
            <Row label="Added">
              {moment(m.addedAt)}
              {m.addedBy ? <span className="text-muted-foreground"> by {m.addedBy.name}</span> : null}
            </Row>
            <Row label="Last seen">{m.lastSeenAt ? moment(m.lastSeenAt) : "Never signed in"}</Row>
            <Row label="Last invitation">
              {m.invitation ? (
                <>
                  {moment(m.invitation.sentAt)}{" "}
                  <span className={m.invitation.delivery === "delivered" || m.invitation.delivery === "sent" ? "text-muted-foreground" : "text-destructive"}>
                    · {DELIVERY_WORDS[m.invitation.delivery]}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">None sent</span>
              )}
            </Row>
            {m.disabledAt ? (
              <Row label="Disabled">
                {moment(m.disabledAt)}
                {m.disabledBy ? <span className="text-muted-foreground"> by {m.disabledBy.name}</span> : null}
              </Row>
            ) : null}
            {m.removedAt ? (
              <Row label="Removed">
                {moment(m.removedAt)}
                {m.removedBy ? <span className="text-muted-foreground"> by {m.removedBy.name}</span> : null}
              </Row>
            ) : null}
          </dl>
        </Panel>
      </div>

      <ReenableDialog memberId={m.id} open={reenable} onOpenChange={setReenable} />

      <ActivityLogDrawer
        app="back-office"
        log="bo-team-member"
        title="Activity"
        description={`${who} - who added them, and every change to their access since.`}
        api={api}
        path={memberActivityPath(m.id)}
        queryKey={[...TEAM_ROOT, "member", m.id, "activity"]}
        fileName="team-member-activity"
      />
    </>
  )
}

function InviteButton({ member }: { member: TeamMemberDetailDTO }) {
  const invite = useTeamChange(member.id, "invite", () => sendInvitation(member.id))
  return (
    <Button
      variant="outline"
      data-tour="person.invite"
      disabled={invite.isPending}
      onClick={() =>
        invite.mutate(undefined, {
          onSuccess: () => toast.success("Invitation sent."),
          onError: (err) => toast.error(teamErrorText(err)),
        })
      }
    >
      {member.invitation ? "Send invitation again" : "Send invitation"}
    </Button>
  )
}

function RepairButton({ member }: { member: TeamMemberDetailDTO }) {
  const queryClient = useQueryClient()
  const repair = useMutation({
    mutationFn: () => repairMember(member.id, member.revision),
    onSuccess: (out) => {
      queryClient.setQueryData(memberQuery(member.id).queryKey, out.member)
      void queryClient.invalidateQueries({ queryKey: TEAM_ROOT })
      track({ name: "team_member_changed", action: "repair" })
      if (out.complete) toast.success("Repaired. The sign-in account matches the record.")
      else toast.error(TEAM_REFUSAL_WORDS.changeIncomplete)
    },
    onError: (err) => toast.error(teamErrorText(err)),
  })
  return (
    <Button variant="outline" disabled={repair.isPending} onClick={() => repair.mutate()}>
      {repair.isPending ? "Repairing…" : "Repair"}
    </Button>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ef-dl__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
