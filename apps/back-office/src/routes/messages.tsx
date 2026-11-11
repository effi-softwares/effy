import { createRoute } from "@tanstack/react-router"

import { withActivityLog } from "@effy/web-kit/activity-log"

import { MessageEditorScreen } from "@/features/messages/MessageEditorScreen"
import { MessageScreen } from "@/features/messages/MessageScreen"
import { MessagesListScreen } from "@/features/messages/MessagesListScreen"
import { messagesList } from "@/features/messages/list"

import { appRoute } from "./app"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Messages (112): the list, the composer (new, from an earlier one, or editing), and one message with its report. */
export const messagesIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "messages",
  validateSearch: (raw: Record<string, unknown>) => messagesList.validateSearch(raw),
  component: MessagesListScreen,
})

export const newMessageRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "messages/new",
  validateSearch: (raw: Record<string, unknown>): { from?: string } =>
    typeof raw.from === "string" && UUID.test(raw.from) ? { from: raw.from } : {},
  component: function NewMessageRoute() {
    const { from } = newMessageRoute.useSearch()
    return <MessageEditorScreen from={from} />
  },
})

export const messageDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "messages/$messageId",
  validateSearch: (raw: Record<string, unknown>) => withActivityLog(raw),
  component: function MessageDetailRoute() {
    const { messageId } = messageDetailRoute.useParams()
    return <MessageScreen messageId={messageId} />
  },
})

export const editMessageRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "messages/$messageId/edit",
  component: function EditMessageRoute() {
    const { messageId } = editMessageRoute.useParams()
    return <MessageEditorScreen messageId={messageId} />
  },
})
