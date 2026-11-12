import type { AutomationDraft, AutomationDTO, AutomationRowDTO, AutomationStateChange, AutomationUpdate, ListPage } from "@effy/shared-types"

import { api } from "@/lib/api"

/** Automatic messages (115): the admin service's routes under /admin/v1/messages/automations on the staff gateway. */
export const fetchAutomationPage = (qs: URLSearchParams, signal: AbortSignal) =>
  api.get<ListPage<AutomationRowDTO>>(`/admin/v1/messages/automations?${qs}`, { signal })
export const getAutomation = (id: string) => api.get<AutomationDTO>(`/admin/v1/messages/automations/${id}`)
export const createAutomation = (body: AutomationDraft) => api.post<AutomationDTO>("/admin/v1/messages/automations", body)
export const updateAutomation = (id: string, body: AutomationUpdate) =>
  api.patch<AutomationDTO>(`/admin/v1/messages/automations/${id}`, body)
export const changeAutomationState = (id: string, body: AutomationStateChange) =>
  api.post<AutomationDTO>(`/admin/v1/messages/automations/${id}/state`, body)
export const automationActivityPath = (id: string) => `/admin/v1/messages/automations/${id}/activity`
