import { useQuery } from "@tanstack/react-query";

import { formatDateTime } from "../model";
import { proofQuery } from "../queries";

const METHOD_LABEL: Record<string, string> = {
  photo: "Photograph",
  signature: "Signature",
  code: "Delivery code",
  contactless: "Left in a safe place",
};

/**
 * The evidence captured when a drop completed (FR-041, FR-042).
 *
 * ⚠ THE MEDIA URL IS TIME-LIMITED AND ISSUING IT IS AUDITED. A photograph of a customer's front door
 * is not a public asset; there is no durable address for one, and every time this component asks for
 * a proof, an `admin.audit_log` row records that it was opened.
 *
 * ⚠ MISSING MEDIA SAYS SO. A proof row can exist with an object that has expired, moved, or was
 * never uploaded, and a broken image placeholder in a dispute is worse than a sentence — it looks
 * like the platform lost the evidence rather than telling you it cannot produce it.
 */
export function ProofViewer({ deliveryTaskId }: { deliveryTaskId: string }) {
  const { data, isPending, isError } = useQuery(proofQuery(deliveryTaskId));

  if (isPending) return <p className="text-xs text-muted-foreground">Loading proof…</p>;
  if (isError || !data) {
    return (
      <p className="text-xs text-muted-foreground">
        No proof of delivery was recorded for this drop.
      </p>
    );
  }

  return (
    <div className="space-y-2 border-l pl-3 text-xs">
      <p>
        <span className="font-medium">{METHOD_LABEL[data.method] ?? data.method}</span> ·{" "}
        {formatDateTime(data.capturedAt)}
        {data.capturedByDriverName ? <> · {data.capturedByDriverName}</> : null}
      </p>
      {data.note ? <p className="text-muted-foreground">“{data.note}”</p> : null}
      {data.method === "photo" || data.method === "signature" ? (
        data.mediaUrl ? (
          <img
            src={data.mediaUrl}
            alt={`${METHOD_LABEL[data.method]} captured at delivery`}
            className="max-h-64 rounded border"
          />
        ) : (
          <p className="text-muted-foreground">
            The {METHOD_LABEL[data.method]?.toLowerCase()} could not be loaded. The file may have
            been moved or removed.
          </p>
        )
      ) : null}
    </div>
  );
}
