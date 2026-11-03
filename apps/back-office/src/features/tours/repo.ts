import type { ConsoleTourPatch, ConsoleTourStateDTO } from "@effy/shared-types"
import { tourStateQueries } from "@effy/web-kit/tour"

import { api } from "@/lib/api"

/** A back-office person's guided-tour record (107): the two calls; the query and the write live in @effy/web-kit/tour. */
export const { stateQuery: tourStateQuery, useTourWrite } = tourStateQueries({
  load: () => api.get<ConsoleTourStateDTO>("/admin/v1/me/tours"),
  save: (patch: ConsoleTourPatch) => api.patch<ConsoleTourStateDTO>("/admin/v1/me/tours", patch),
})
