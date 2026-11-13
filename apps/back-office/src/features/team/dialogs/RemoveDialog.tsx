import { TEAM_CONFIRM_WORDS, type TeamMemberDetailDTO } from "@effy/shared-types"

import { removeMember } from "../repo"
import { ConfirmChange } from "./ConfirmChange"

/** Remove (119 US5): disabled people only. The sign-in account goes; the record and their name stay. */
export function RemoveDialog({ member }: { member: TeamMemberDetailDTO }) {
  return (
    <ConfirmChange
      memberId={member.id}
      action="remove"
      trigger="Remove"
      title={`Remove ${member.name ?? member.email}?`}
      sentence={TEAM_CONFIRM_WORDS.remove}
      confirm="Remove"
      destructive
      run={() => removeMember(member.id, member.revision)}
    />
  )
}
