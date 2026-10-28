import { useQuery } from "@tanstack/react-query"

import { Card, Skeleton } from "@effy/design-system/ui"
import { ErrorState, useHeaderDetail } from "@effy/web-kit/console"

import { PageHeader } from "@effy/web-kit/patterns"
import { sessionQuery } from "@/features/auth/queries"

import { canReplyFeedback } from "./access"
import { FeedbackPanel } from "./FeedbackPanel"
import { feedbackDetailQuery } from "./queries"

export function FeedbackDetailScreen({ referenceCode }: { referenceCode: string }) {
  const { data, isPending, isError, error, refetch } = useQuery(feedbackDetailQuery(referenceCode))
  const { data: session } = useQuery(sessionQuery)
  const roles = session?.status === "signed-in" ? session.identity.roles : []
  useHeaderDetail(referenceCode)

  return (
    <>
      <PageHeader back={{ label: "Feedback", link: { to: "/feedback" } }} title="Customer feedback" />
      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <Skeleton className="h-96" />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <FeedbackPanel detail={data} mayReply={canReplyFeedback(roles)} />
        </Card>
      )}
    </>
  )
}
