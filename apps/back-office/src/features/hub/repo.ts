import type { HubCheckinsResponseDTO, HubExpectedDTO, LabelReadDTO } from "@effy/shared-types";

import { api } from "@/lib/api";

// The hub station's data layer (fleet, staff gateway). Screens never call the api directly.

export function getHubExpected(): Promise<HubExpectedDTO> {
  return api.get<HubExpectedDTO>("/fleet/v1/hub/expected");
}

export function postHubCheckins(reads: Partial<LabelReadDTO>[]): Promise<HubCheckinsResponseDTO> {
  return api.post<HubCheckinsResponseDTO>("/fleet/v1/hub/checkins", { reads });
}
