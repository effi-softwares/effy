// Package notifications is the hot-path PRODUCER side of the push-notification outbox
// (050-observability-push-foundation). It appends a notification intent to
// public.notification_request on the SAME transaction as the fact it announces, so a notification can
// never be lost or double-enqueued. The cold-path notifications worker drains and sends it.
//
// This mirrors platform/events.Append (the order.placed outbox) — a separate table because this is a
// NOTIFICATION intent (recipient already resolved), not a domain EVENT. SNS-ready (research R6).
package notifications

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// Request is one notification intent. DedupeKey is derived (type:recipient:entity) so a retried
// producer path enqueues exactly once (FR-016). Payload carries only non-PII routing data (FR-021).
type Request struct {
	RecipientSub string
	Audience     string // customer | shop | driver
	Type         string // order_paid | order_ready | ...
	EntityID     string // orderId | fulfillmentId | runId
	DeepLink     string // effy://order/<id> — where a tap lands (FR-017)
}

const qAppend = `
INSERT INTO public.notification_request (recipient_sub, audience, type, payload, dedupe_key)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (dedupe_key) DO NOTHING
`

// Append writes the intent on the caller-supplied tx. ON CONFLICT DO NOTHING makes a re-run a no-op.
func Append(ctx context.Context, tx db.DBTX, r Request) error {
	payload, err := json.Marshal(map[string]string{"entityId": r.EntityID, "deepLink": r.DeepLink})
	if err != nil {
		return fmt.Errorf("notifications: marshal payload for %s: %w", r.Type, err)
	}
	dedupe := r.Type + ":" + r.RecipientSub + ":" + r.EntityID
	if _, err := tx.Exec(ctx, qAppend, r.RecipientSub, r.Audience, r.Type, payload, dedupe); err != nil {
		return fmt.Errorf("notifications: append %s: %w", r.Type, err)
	}
	return nil
}
