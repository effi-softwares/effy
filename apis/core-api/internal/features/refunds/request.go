package refunds

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// A customer asking for a refund (055 US3).
//
// ⚠ IT MOVES NO MONEY, AND THAT SEPARATION IS THE WHOLE DESIGN (FR-005r). A form that withdrew money
// on submission would be exactly the wrong thing to build: it would let anyone refund their own order
// by describing a problem. This records an ASK; a person decides it, and the deciding is the existing
// refund path with its own gate.
//
// ⚠ IT REPLACES "email support and hope". Today "Get help" opens the generic 046 feedback form with
// NO ORDER REFERENCE ATTACHED, so a shopper describing a missing item lands in an inbox where nobody
// can see the order they mean. That is the failure gap G3 describes, on the customer's side.
//
// ⚠ IT IS NOT A MESSAGE THREAD. One statement, one outcome. A thread would be a support product, and
// building half of one — where replies arrive and nobody is assigned to answer — is worse than not
// building it at all.

var (
	// ErrRequestAlreadyOpen — this order already has an unanswered request.
	//
	// ⚠ ENFORCED BY A PARTIAL UNIQUE INDEX, not a check-then-write. Two taps a few milliseconds apart
	// would slip between a SELECT and an INSERT, and the shopper would have raised the same complaint
	// twice — which is not just untidy: it doubles the queue staff work through.
	ErrRequestAlreadyOpen = errors.New("refunds: a request is already open on this order")
	// ErrRequestNotFound — no such request, or not one this caller may see.
	ErrRequestNotFound = errors.New("refunds: request not found")
	// ErrMessageRequired — a request with nothing in it cannot be acted on.
	ErrMessageRequired = errors.New("refunds: say what went wrong")
)

// maxRequestMessage bounds what a shopper can write.
//
// ⚠ A LIMIT, NOT A LENGTH REQUIREMENT. "Two cartons were missing" is a complete complaint, and a
// minimum-length rule would make a shopper pad an accurate sentence to satisfy a form.
const maxRequestMessage = 2000

// RaiseRequestInput is one customer's ask.
type RaiseRequestInput struct {
	OrderID    string
	CustomerID string
	Message    string
	// ⚠ OPTIONAL. A shopper who cannot say which line is affected — "the whole thing arrived warm" —
	// must still be able to ask, and requiring items would push them back to the generic inbox.
	Items []RequestItem
}

type RequestItem struct {
	OrderItemID string
	Quantity    int
}

// RaiseRequest records a customer's ask against their own order.
func (s *Service) RaiseRequest(ctx context.Context, in RaiseRequestInput) (string, error) {
	msg := strings.TrimSpace(in.Message)
	if msg == "" {
		return "", ErrMessageRequired
	}
	if len(msg) > maxRequestMessage {
		msg = msg[:maxRequestMessage]
	}
	in.Message = msg
	return s.repo.InsertRequest(ctx, in)
}

// InsertRequest writes the request and its named lines in one transaction.
//
// ⚠ THE OWNERSHIP TERM IS IN THE INSERT'S OWN SELECT, not a separate check. `INSERT … SELECT … WHERE
// o.customer_id = $2` means an order that is not the caller's produces zero rows — indistinguishable
// from an order that does not exist (FR-016). Two separate questions would make the refusal an oracle
// for which order ids are real.
func (r *Repository) InsertRequest(ctx context.Context, in RaiseRequestInput) (string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("refunds: request begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var id string
	err = tx.QueryRow(ctx, `
INSERT INTO public.refund_request (order_id, customer_id, message)
SELECT o.id, o.customer_id, $3
  FROM public."order" o
 WHERE o.id = $1
   AND o.customer_id::text = $2
   -- ⚠ Only a PAID order can be refunded, so only a paid order can be asked about. A request on an
   -- unpaid or cancelled order would sit in the queue with no possible outcome.
   AND o.status = 'paid'
RETURNING id::text`, in.OrderID, in.CustomerID, in.Message).Scan(&id)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		// ⚠ THE PARTIAL UNIQUE INDEX FIRED. This is the check-then-write race, refused by the database
		// rather than by a window between two statements.
		return "", ErrRequestAlreadyOpen
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrOrderNotFound
	}
	if err != nil {
		return "", fmt.Errorf("refunds: insert request: %w", err)
	}

	for _, item := range in.Items {
		if item.Quantity <= 0 {
			continue
		}
		// ⚠ The line must belong to THIS order. Without the join a caller could name any order item
		// id and have it recorded against their own request.
		if _, err := tx.Exec(ctx, `
INSERT INTO public.refund_request_item (request_id, order_item_id, quantity)
SELECT $1, oi.id, $3
  FROM public.order_item oi
 WHERE oi.id = $2 AND oi.order_id = $4
ON CONFLICT (request_id, order_item_id) DO NOTHING`,
			id, item.OrderItemID, item.Quantity, in.OrderID); err != nil {
			return "", fmt.Errorf("refunds: insert request item: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("refunds: request commit: %w", err)
	}
	return id, nil
}

// DecideRequest closes an open request (FR-005r2).
//
// ⚠ A DECLINE IS DELIBERATELY NOT EMAILED (T069a). An unsolicited "we said no" invites a reply into
// something that is not a conversation, and the order screen is where the shopper is already looking.
// A refund, by contrast, IS emailed — because money moving is a fact they need to know about whether
// or not they open the app again.
func (r *Repository) DecideRequest(ctx context.Context, requestID, status, note, decidedBy string) error {
	tag, err := r.pool.Exec(ctx, `
UPDATE public.refund_request
   SET status = $2, outcome_note = NULLIF($3, ''), decided_by = $4, decided_at = now()
 WHERE id = $1
   -- ⚠ Guarded on the open status, so a second decision cannot overwrite the first. Two staff clearing
   -- the same queue must not be able to turn a decline into a refund by clicking later.
   AND status = 'open'`, requestID, status, note, decidedBy)
	if err != nil {
		return fmt.Errorf("refunds: decide request: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrRequestNotFound
	}
	return nil
}

// CloseOpenRequestForOrder marks an order's open request refunded (FR-005r2).
//
// ⚠ CALLED WHEN A REFUND IS ISSUED, so a shopper who asked and was answered sees the outcome without
// anyone doing a second piece of admin. A request left open after its refund is a queue item nobody
// can close and a shopper who is never told.
//
// ⚠ IT IS NOT AN ERROR FOR THERE TO BE NO OPEN REQUEST. Most refunds are issued without one — the
// platform proposes them from shortfalls (FR-004a) — and failing a refund because nobody asked for it
// would be absurd.
func (r *Repository) CloseOpenRequestForOrder(ctx context.Context, orderID, decidedBy string) error {
	_, err := r.pool.Exec(ctx, `
UPDATE public.refund_request
   SET status = 'refunded', decided_by = $2, decided_at = now()
 WHERE order_id = $1 AND status = 'open'`, orderID, decidedBy)
	if err != nil {
		return fmt.Errorf("refunds: close request: %w", err)
	}
	return nil
}
