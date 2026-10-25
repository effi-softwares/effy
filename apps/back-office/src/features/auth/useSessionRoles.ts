import { useQuery } from "@tanstack/react-query"

import type { BackOfficeRole } from "@effy/shared-types"

import { sessionQuery } from "./queries"

export function useSessionRoles(): readonly BackOfficeRole[] {
  const { data: session } = useQuery(sessionQuery)
  return session?.status === "signed-in" ? session.identity.roles : []
}
