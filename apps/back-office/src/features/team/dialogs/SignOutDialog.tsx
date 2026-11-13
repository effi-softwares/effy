import { TEAM_CONFIRM_WORDS, type TeamMemberDetailDTO } from "@effy/shared-types"

import { signOutEverywhere } from "../repo"
import { ConfirmChange } from "./ConfirmChange"

/** Sign out everywhere (119 US6): every session ends; role and status are unchanged. */
export function SignOutDialog({ member }: { member: TeamMemberDetailDTO }) {
  return (
    <ConfirmChange
      memberId={member.id}
      action="sign_out"
      trigger="Sign out everywhere"
      title={`Sign ${member.name ?? member.email} out everywhere?`}
      sentence={TEAM_CONFIRM_WORDS.signOut}
      confirm="Sign out everywhere"
      run={() => signOutEverywhere(member.id)}
    />
  )
}
