import { TEAM_CONFIRM_WORDS, type TeamMemberDetailDTO } from "@effy/shared-types"

import { setStatus } from "../repo"
import { ConfirmChange } from "./ConfirmChange"

/** Disable (119 US2): sign-in stops at once, every session ends, every request is refused from now on. */
export function DisableDialog({ member }: { member: TeamMemberDetailDTO }) {
  return (
    <ConfirmChange
      memberId={member.id}
      action="disable"
      trigger="Disable"
      tour="person.disable"
      title={`Disable ${member.name ?? member.email}?`}
      sentence={TEAM_CONFIRM_WORDS.disable}
      confirm="Disable"
      destructive
      run={() => setStatus(member.id, "disabled", member.revision)}
    />
  )
}
