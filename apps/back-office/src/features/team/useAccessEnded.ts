import { useEffect, useRef } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import type { BackOfficeRole } from "@effy/shared-types"

import { useSignOut } from "@/features/auth/queries"

import { isAccessEnded } from "./access"
import { meQuery } from "./queries"

/**
 * 119 research R8: `/me` answers 403 `not_on_team` or `staff_disabled` when the team record no longer lets this person
 * in. The browser is signed out and sign-in says why. Returns the record's roles once read (the record decides, R1).
 */
export function useAccessEnded(enabled: boolean): readonly BackOfficeRole[] | null {
  const me = useQuery({ ...meQuery, enabled, retry: (n, err) => !isAccessEnded(err) && n < 2 })
  const signOut = useSignOut()
  const navigate = useNavigate()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || !me.isError || !isAccessEnded(me.error)) return
    done.current = true
    signOut.mutate(undefined, {
      onSettled: () => void navigate({ to: "/auth/sign-in", search: { ended: "1" } }),
    })
  }, [me.isError, me.error, signOut, navigate])

  return me.data ? me.data.roles : null
}
