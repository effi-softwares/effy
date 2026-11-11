import type {
  ListPage,
  MessageActionRequest,
  MessageAudienceCountDTO,
  MessageAudienceCountRequest,
  MessageCreateRequest,
  MessageDTO,
  MessagePictureUploadDTO,
  MessageRowDTO,
  MessageSendRequest,
  MessageTestDTO,
  MessageTestRequest,
  MessageUpdateRequest,
} from "@effy/shared-types"

import { api } from "@/lib/api"

/** Back-office messages (112): the admin service's messages routes on the staff gateway. */
export const fetchMessagePage = (qs: URLSearchParams, signal: AbortSignal) =>
  api.get<ListPage<MessageRowDTO>>(`/admin/v1/messages?${qs}`, { signal })
export const getMessage = (id: string) => api.get<MessageDTO>(`/admin/v1/messages/${id}`)
export const createMessage = (body: MessageCreateRequest) => api.post<MessageDTO>("/admin/v1/messages", body)
export const updateMessage = (id: string, body: MessageUpdateRequest) =>
  api.put<MessageDTO>(`/admin/v1/messages/${id}`, body)
export const countAudience = (body: MessageAudienceCountRequest) =>
  api.post<MessageAudienceCountDTO>("/admin/v1/messages/audience-count", body)
export const testMessage = (id: string, body: MessageTestRequest) =>
  api.post<MessageTestDTO>(`/admin/v1/messages/${id}/test`, body)
export const sendMessage = (id: string, body: MessageSendRequest) =>
  api.post<MessageDTO>(`/admin/v1/messages/${id}/send`, body)
export const cancelMessage = (id: string, body: MessageActionRequest) =>
  api.post<MessageDTO>(`/admin/v1/messages/${id}/cancel`, body)
export const stopMessage = (id: string, body: MessageActionRequest) =>
  api.post<MessageDTO>(`/admin/v1/messages/${id}/stop`, body)
export const withdrawMessage = (id: string, body: MessageActionRequest) =>
  api.post<MessageDTO>(`/admin/v1/messages/${id}/withdraw`, body)

/** A picture goes straight to storage through a presigned address; the message then names its key. */
export async function uploadMessagePicture(id: string, file: File): Promise<string> {
  const target = await api.post<MessagePictureUploadDTO>(`/admin/v1/messages/${id}/picture`, {
    contentType: file.type,
    fileSize: file.size,
  })
  const res = await fetch(target.uploadUrl, { method: "PUT", body: file, headers: { "content-type": file.type } })
  if (!res.ok) throw new Error("the picture could not be uploaded")
  return target.key
}

/** The messages one person (or one shop) received: the activity drawer's path (R16). */
export const receivedPath = (audience: "customer" | "driver" | "shop", id: string) =>
  `/admin/v1/messages/received?audience=${audience}&id=${encodeURIComponent(id)}`
