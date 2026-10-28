import { createRoute } from "@tanstack/react-router"

import { FeedbackDetailScreen } from "@/features/feedback/FeedbackDetailScreen"
import { FeedbackListScreen } from "@/features/feedback/FeedbackListScreen"

import { feedbackList } from "@/features/feedback/model"

import { appRoute } from "./app"

export const feedbackIndexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "feedback",
  validateSearch: (raw: Record<string, unknown>) => feedbackList.validateSearch(raw),
  component: FeedbackListScreen,
})

export const feedbackDetailRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "feedback/$referenceCode",
  component: FeedbackDetailRouteComponent,
})

function FeedbackDetailRouteComponent() {
  const { referenceCode } = feedbackDetailRoute.useParams()
  return <FeedbackDetailScreen referenceCode={referenceCode} />
}
