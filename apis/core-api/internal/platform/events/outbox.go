// Package events implements the transactional outbox (research R6) — the "event" half of the
// multi-shop fan-out. An envelope row is appended to public.event_outbox on the SAME pgx.Tx that
// commits the order's paid transition, so an order.placed event can never be lost or double-emitted.
//
// The envelope shape matches ARCHITECTURE.md's one event language, so the future SNS/SQS backbone (a
// later slice) reuses it unchanged — a drainer sets published_at once it dispatches. Nothing dispatches
// here.
package events

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/db"
)

// Envelope is one domain event to publish. dedup_key makes emission exactly-once per aggregate event
// (UNIQUE), payload carries the fact (for order.placed: the order summary + per-shop breakdown).
type Envelope struct {
	EventType     string
	DedupKey      string
	AggregateType string
	AggregateID   string
	Payload       any
}

const qAppend = `
INSERT INTO public.event_outbox (event_type, dedup_key, aggregate_type, aggregate_id, payload)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (dedup_key) DO NOTHING
`

// Append writes the envelope on the caller-supplied tx. ON CONFLICT DO NOTHING makes a re-run (e.g. a
// retried finalizer) a no-op, so the event is emitted exactly once even under retries.
func Append(ctx context.Context, tx db.DBTX, e Envelope) error {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		return fmt.Errorf("events: marshal payload for %s: %w", e.EventType, err)
	}
	if _, err := tx.Exec(ctx, qAppend, e.EventType, e.DedupKey, e.AggregateType, e.AggregateID, payload); err != nil {
		return fmt.Errorf("events: append %s: %w", e.EventType, err)
	}
	return nil
}
