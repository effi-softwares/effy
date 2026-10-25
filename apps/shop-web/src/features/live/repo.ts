import { isDomainError } from "@effy/api-client"
import type { LiveDescriptor } from "@effy/shared-types"

import { api } from "@/lib/api"

export async function getLiveDescriptor(): Promise<LiveDescriptor | null> {
  try {
    return (await api.get<LiveDescriptor | undefined>("/shop/v1/live")) ?? null
  } catch (err) {
    if (
      isDomainError(err) &&
      (err.kind === "forbidden" || err.kind === "not-found" || err.kind === "unauthenticated")
    ) {
      return null
    }
    throw err
  }
}
