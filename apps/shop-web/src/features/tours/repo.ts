import type { ConsoleTourPatch, ConsoleTourStateDTO } from "@effy/shared-types"
import { tourStateQueries } from "@effy/web-kit/tour"

import { api } from "@/lib/api"

/** The person's guided-tour state (106): the two calls; the query and the write live in @effy/web-kit/tour. */
export const {
  stateQuery: tourStateQuery,
  useTourWrite,
  registerTourMutationDefaults,
} = tourStateQueries({
  load: () => api.get<ConsoleTourStateDTO>("/shop/v1/me/tours"),
  save: (patch: ConsoleTourPatch) => api.patch<ConsoleTourStateDTO>("/shop/v1/me/tours", patch),
})
