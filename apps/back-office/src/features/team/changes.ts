import { useMutation, useQueryClient } from "@tanstack/react-query"

import { isDomainError } from "@effy/api-client"
import { toast } from "@effy/design-system/ui"
import { TEAM_REFUSAL_SENTENCE, TEAM_REFUSAL_WORDS, type TeamChangeDTO, type TeamRefusal } from "@effy/shared-types"

import { track } from "@/lib/telemetry"

import { teamRefusal } from "./access"
import { memberQuery, TEAM_ROOT } from "./queries"

/** What a refused or failed team change says, in the spec's words. */
export function teamErrorText(err: unknown): string {
  const word = teamRefusal(err)
  if (word && word in TEAM_REFUSAL_SENTENCE) return TEAM_REFUSAL_SENTENCE[word as TeamRefusal]
  if (isDomainError(err) && err.status === 400) return err.fields?.[0]?.message ?? "Check what you entered."
  if (isDomainError(err) && err.status === 403) return "Only an administrator can change the team."
  return "That did not go through. Try again."
}

/** A team change on one person: the answer becomes their page, the list re-reads; a stale view re-reads too (FR-024). */
export function useTeamChange<V>(memberId: string, action: string, run: (v: V) => Promise<TeamChangeDTO>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: (out) => {
      queryClient.setQueryData(memberQuery(memberId).queryKey, out.member)
      void queryClient.invalidateQueries({ queryKey: TEAM_ROOT })
      track({ name: "team_member_changed", action, ...(out.member.role ? { role: out.member.role } : {}) })
      if (!out.complete) toast.error(TEAM_REFUSAL_WORDS.changeIncomplete)
    },
    onError: (err) => {
      if (teamRefusal(err) === "staff_changed") void queryClient.invalidateQueries({ queryKey: TEAM_ROOT })
    },
  })
}
