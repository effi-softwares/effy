package refunds

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/effyshopping/effy/apis/core-api/internal/features/checkout"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	tcpostgres "github.com/testcontainers/testcontainers-go/modules/postgres"
)

// Container-backed proofs for 055's money rules (SC-002, SC-003).
//
// ⚠ THESE CANNOT BE UNIT TESTS, and the reason is the whole design. The ceiling is a `SUM` under a
// `FOR UPDATE` row lock, and idempotency is a `UNIQUE` constraint with `ON CONFLICT DO NOTHING`.
// A fake repository would happily accept two refunds for the last dollar and prove nothing about the
// thing that actually stops a customer being refunded twice.
//
// ⚠ RUN THEM. 052 lost an entire session's exactly-once proofs to a silent Docker skip, and 054 nearly
// did. `docker info` before trusting a green suite that includes this file.

// ⚠ The REAL migrations are applied, not a hand-written subset. A subset is a second definition of the
// schema, and the constraints under test here are exactly the kind that drift out of one.
func startPostgres(t *testing.T) *pgxpool.Pool {
	t.Helper()
	if testing.Short() {
		t.Skip("skipping container-backed test in -short mode")
	}
	ctx := context.Background()

	pgc, err := tcpostgres.Run(ctx, "postgres:16-alpine",
		tcpostgres.WithDatabase("effy"),
		tcpostgres.WithUsername("effy"),
		tcpostgres.WithPassword("test-only"),
		tcpostgres.BasicWaitStrategies(),
	)
	testcontainers.CleanupContainer(t, pgc)
	require.NoError(t, err)

	dsn, err := pgc.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)
	pool, err := pgxpool.New(ctx, dsn)
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	applyMigrations(t, pool)
	return pool
}

func applyMigrations(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	dir := filepath.Join("..", "..", "..", "..", "..", "db", "migrations")
	entries, err := os.ReadDir(dir)
	require.NoError(t, err, "migrations directory")

	var files []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	require.NotEmpty(t, files, "no migrations found — this guard would otherwise pass vacuously")

	for _, name := range files {
		body, err := os.ReadFile(filepath.Join(dir, name))
		require.NoError(t, err)
		up := upSection(string(body))
		_, err = pool.Exec(context.Background(), up)
		require.NoError(t, err, "applying %s", name)
	}
}

// upSection returns everything between the goose Up and Down markers.
func upSection(body string) string {
	start := strings.Index(body, "-- +goose Up")
	if start < 0 {
		return body
	}
	rest := body[start:]
	if end := strings.Index(rest, "-- +goose Down"); end >= 0 {
		return rest[:end]
	}
	return rest
}

const (
	custID  = "11111111-1111-4111-8111-111111111111"
	orderID = "22222222-2222-4222-8222-222222222222"
)

// seedPaidOrder creates a customer with a paid order of `paidCents`.
func seedPaidOrder(t *testing.T, pool *pgxpool.Pool, paidCents int64) {
	t.Helper()
	ctx := context.Background()
	amount := float64(paidCents) / 100.0
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO public.customer (id, cognito_sub, email) VALUES ($1,'sub-1','a@b.c')`, []any{custID}},
		{`INSERT INTO public."order" (id, customer_id, order_number, status, item_subtotal_amount,
		   delivery_fee_amount, grand_total_amount, delivery_address)
		  VALUES ($1,$2,'EFY-T1','paid',$3,0,$3,'{}'::jsonb)`, []any{orderID, custID, amount}},
		{`INSERT INTO public.payment (order_id, stripe_payment_intent_id, amount, status)
		  VALUES ($1,'pi_test',$2,'succeeded')`, []any{orderID, amount}},
	} {
		_, err := pool.Exec(ctx, q.sql, q.args...)
		require.NoError(t, err, q.sql)
	}
}

func refundInput(key string, cents int64) InsertInput {
	return InsertInput{
		OrderID: orderID, Kind: "goodwill", AmountCents: cents, Currency: "AUD",
		Reason: "goodwill", Note: ptr("test"), IdempotencyKey: key,
		ActorKind: "back_office", ActorSub: "staff-1",
	}
}

func ptr(s string) *string { return &s }

func totalRefunded(t *testing.T, pool *pgxpool.Pool) int64 {
	t.Helper()
	var cents int64
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT COALESCE(SUM(round(amount*100))::bigint,0) FROM public.refund WHERE order_id = $1`,
		orderID).Scan(&cents))
	return cents
}

func TestCeiling_RefusesMoreThanWasPaid(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000) // $50.00
	repo := NewRepository(pool)

	_, _, err := repo.Record(context.Background(), refundInput("k1", 6000))
	var ceil *ErrCeilingExceeded
	require.ErrorAs(t, err, &ceil, "refunding more than was paid must be refused")
	require.Equal(t, int64(5000), ceil.RemainingCents,
		"the refusal must state what remains, or the operator cannot act on it (FR-002)")
	require.Zero(t, totalRefunded(t, pool), "a refused refund must leave no trace")
}

func TestCeiling_AccumulatesAcrossPartialRefunds(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	repo := NewRepository(pool)
	ctx := context.Background()

	_, _, err := repo.Record(ctx, refundInput("k1", 3000))
	require.NoError(t, err)
	// ⚠ `submitting` does NOT count yet (FR-005e) — the provider has not accepted it.
	_, paid, err := repo.Record(ctx, refundInput("k2", 3000))
	require.NoError(t, err, "while both are `submitting`, neither holds the ceiling down")
	require.Equal(t, int64(0), paid.RefundedCents)

	// Once accepted, they do.
	var ids []string
	rows, err := pool.Query(ctx, `SELECT id::text FROM public.refund WHERE order_id=$1`, orderID)
	require.NoError(t, err)
	for rows.Next() {
		var id string
		require.NoError(t, rows.Scan(&id))
		ids = append(ids, id)
	}
	rows.Close()
	for i, id := range ids {
		require.NoError(t, repo.MarkSubmitted(ctx, id, "re_"+string(rune('a'+i))))
	}

	_, _, err = repo.Record(ctx, refundInput("k3", 1))
	var ceil *ErrCeilingExceeded
	require.ErrorAs(t, err, &ceil, "$30 + $30 accepted against a $50 payment leaves nothing")
}

// ⚠⚠ SC-002 — THE CASE THIS SLICE EXISTS TO GET RIGHT.
//
// Two staff members refund the last of an order at the same instant. Without the `FOR UPDATE` lock,
// both read the same "nothing refunded yet", both pass the ceiling check, and the customer is refunded
// twice — real money, irreversibly.
func TestCeiling_ConcurrentRefundsNeverExceedWhatWasPaid(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	repo := NewRepository(pool)

	// ⚠ A BARRIER, NOT JUST TWO GOROUTINES. Without one they finish fast enough to serialise by
	// accident, and this test passed with the row lock REMOVED — proving nothing. The hook holds each
	// goroutine at the door until both are there, so they contend for the lock for real. ⚠ Holding them
	// AFTER the lock deadlocks instead — the first holds the row while the second waits forever.
	var arrived sync.WaitGroup
	arrived.Add(2)
	release := make(chan struct{})
	beforeLock = func() {
		arrived.Done()
		<-release
	}
	t.Cleanup(func() { beforeLock = nil })
	go func() { arrived.Wait(); close(release) }()

	// Each asks for the WHOLE amount. Exactly one may win.
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i := range errs {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			in := refundInput("concurrent-"+string(rune('a'+i)), 5000)
			// Both must be `submitted` to hold the ceiling, so settle inside the goroutine.
			id, _, err := repo.Record(context.Background(), in)
			if err == nil {
				_ = repo.MarkSubmitted(context.Background(), id, "re_c"+string(rune('a'+i)))
			}
			errs[i] = err
		}(i)
	}
	wg.Wait()

	okCount := 0
	for _, e := range errs {
		if e == nil {
			okCount++
		}
	}
	require.Equal(t, 1, okCount, "exactly one full refund may succeed against one payment")
	require.LessOrEqual(t, totalRefunded(t, pool), int64(5000),
		"the total refunded must NEVER exceed what the customer paid (SC-002)")
}

// ⚠ SC-003. A double-click, a retry, a redelivered instruction — one refund.
func TestIdempotency_TheSameActionRefundsOnce(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	repo := NewRepository(pool)
	ctx := context.Background()

	id, _, err := repo.Record(ctx, refundInput("same-key", 1000))
	require.NoError(t, err)
	require.NotEmpty(t, id)

	_, _, err = repo.Record(ctx, refundInput("same-key", 1000))
	require.ErrorIs(t, err, ErrAlreadyIssued,
		"a repeat of the same action is a SUCCESS that changed nothing, not a new refund")
	require.Equal(t, int64(1000), totalRefunded(t, pool), "one refund, not two")
}

// ⚠ FR-010. A redelivered provider event must change the recorded state at most once.
func TestSettle_IsIdempotentAcrossRedeliveredEvents(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	repo := NewRepository(pool)
	ctx := context.Background()

	id, _, err := repo.Record(ctx, refundInput("k1", 1000))
	require.NoError(t, err)
	require.NoError(t, repo.MarkSubmitted(ctx, id, "re_1"))

	applied, err := repo.SettleByProviderID(ctx, "re_1", "succeeded", "")
	require.NoError(t, err)
	require.True(t, applied, "the first delivery applies")

	applied, err = repo.SettleByProviderID(ctx, "re_1", "succeeded", "")
	require.NoError(t, err)
	require.False(t, applied, "a redelivery must change nothing")
}

// ⚠ FR-009 — the case a naive integration never learns about: the bank rejects it days later.
func TestSettle_AFailureStopsTheOrderClaimingTheMoneyWentBack(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	repo := NewRepository(pool)
	ctx := context.Background()

	id, _, err := repo.Record(ctx, refundInput("k1", 1000))
	require.NoError(t, err)
	require.NoError(t, repo.MarkSubmitted(ctx, id, "re_1"))

	applied, err := repo.SettleByProviderID(ctx, "re_1", "failed", "expired_or_canceled_card")
	require.NoError(t, err)
	require.True(t, applied)

	var status, reason string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT status, failure_reason FROM public.refund WHERE id = $1`, id).Scan(&status, &reason))
	require.Equal(t, "failed", status)
	require.Equal(t, "expired_or_canceled_card", reason,
		"the provider's reason must survive for staff — it is the only clue why")
}

// ── Issue end-to-end, against a real database and a recording gateway ───────────────────────────

type recordingGateway struct {
	checkout.PaymentGateway // embedded: every other method panics if called, which is the point
	calls                   []checkout.CreateRefundInput
	err                     error
	// The provider refund id to hand back, so a settle test can name the refund it just issued.
	refundID string
}

func (g *recordingGateway) CreateRefund(_ context.Context, in checkout.CreateRefundInput) (checkout.Refund, error) {
	g.calls = append(g.calls, in)
	if g.err != nil {
		return checkout.Refund{}, g.err
	}
	// ⚠ `pending`, mirroring the provider. A fake returning `succeeded` would let the code record
	// money as returned at submission — the defect US4 exists to prevent.
	id := g.refundID
	if id == "" {
		id = "re_recorded"
	}
	return checkout.Refund{ID: id, Status: checkout.RefundPending}, nil
}

// ⚠ FR-006 / A4 — THE DESTINATION IS NEVER THE CALLER'S TO CHOOSE.
//
// There is no destination field on any request shape, so this cannot be tested by supplying a bad one;
// what CAN be shown is where the destination actually comes from — the order's own payment row, read
// under the ceiling lock. An endpoint that took one would be a way to redirect somebody else's money.
func TestIssue_SendsMoneyToTheOrdersOwnPaymentAndNowhereElse(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	gw := &recordingGateway{}
	svc := NewService(NewRepository(pool), gw)

	_, err := svc.Issue(context.Background(), IssueInput{ActorKind: "back_office",
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "late delivery", Amount: "10.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)
	require.Len(t, gw.calls, 1)
	require.Equal(t, "pi_test", gw.calls[0].PaymentIntentID,
		"the refund must go to the payment recorded against THIS order — the only destination that exists")
	require.Equal(t, int64(1000), gw.calls[0].AmountCents)
	require.Equal(t, "requested_by_customer", gw.calls[0].Reason,
		"⚠ never `fraudulent` — it blocklists the payer beyond this order")
}

// ⚠ The key the provider sees must be the key we stored, or an ambiguous retry creates a SECOND refund
// at the provider even though ours is idempotent (FR-005d).
func TestIssue_SendsTheSameIdempotencyKeyItStored(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	gw := &recordingGateway{}
	svc := NewService(NewRepository(pool), gw)
	ctx := context.Background()

	_, err := svc.Issue(ctx, IssueInput{ActorKind: "back_office",
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "x", Amount: "10.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)

	var stored string
	require.NoError(t, pool.QueryRow(ctx,
		`SELECT idempotency_key FROM public.refund WHERE order_id = $1`, orderID).Scan(&stored))
	require.Equal(t, stored, gw.calls[0].IdempotencyKey,
		"our uniqueness constraint and the provider's must be the same key, or a retry is only half safe")
}

// ⚠ FR-007. Submitting is not refunding. After a successful call the row must read `submitted`, and
// the provider's own status is `pending` — the bank has not moved anything.
func TestIssue_RecordsSubmittedNotRefunded(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	svc := NewService(NewRepository(pool), &recordingGateway{})

	out, err := svc.Issue(context.Background(), IssueInput{ActorKind: "back_office",
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "x", Amount: "10.00", ActorSub: "staff-1",
	})
	require.NoError(t, err)
	require.Equal(t, "submitted", out.Status,
		"the operator must never be told 'refunded' before the bank has moved anything")

	var status string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT status FROM public.refund WHERE order_id = $1`, orderID).Scan(&status))
	require.Equal(t, "submitted", status)
}

// ⚠ FR-005d. An AMBIGUOUS failure leaves the row `submitting` — it must NOT be marked refused, and it
// must not count as refunded. The money may or may not be in flight, and only a retry can find out.
func TestIssue_AnAmbiguousFailureLeavesTheRefundRetryable(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	gw := &recordingGateway{err: errors.New("connection reset")}
	svc := NewService(NewRepository(pool), gw)

	out, err := svc.Issue(context.Background(), IssueInput{ActorKind: "back_office",
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "x", Amount: "10.00", ActorSub: "staff-1",
	})
	require.NoError(t, err, "an ambiguous failure is not the operator's problem to solve")
	require.Equal(t, "submitting", out.Status)

	var status string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT status FROM public.refund WHERE order_id = $1`, orderID).Scan(&status))
	require.Equal(t, "submitting", status, "still retryable — NOT refused")
	require.Zero(t, refundedTowardCeiling(t, pool), "a refund the provider never accepted must not hold the ceiling down")
}

// ⚠ FR-005d, the other half. A DEFINITE refusal is terminal: retrying a decision cannot change it.
func TestIssue_ADefiniteRefusalIsTerminalAndKeepsTheProvidersReason(t *testing.T) {
	pool := startPostgres(t)
	seedPaidOrder(t, pool, 5000)
	gw := &recordingGateway{err: &checkout.RefusedError{Reason: "charge_already_refunded"}}
	svc := NewService(NewRepository(pool), gw)

	_, err := svc.Issue(context.Background(), IssueInput{ActorKind: "back_office",
		OrderID: orderID, Kind: "goodwill", Reason: ReasonGoodwill,
		Note: "x", Amount: "10.00", ActorSub: "staff-1",
	})
	require.Error(t, err, "a refusal IS the operator's problem — they must be told")

	var status, reason string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT status, failure_reason FROM public.refund WHERE order_id = $1`, orderID).Scan(&status, &reason))
	require.Equal(t, "refused", status)
	require.Equal(t, "charge_already_refunded", reason,
		"the provider's own words must survive — they are the only clue why")
}

// refundedTowardCeiling is what actually counts against what may still be refunded.
func refundedTowardCeiling(t *testing.T, pool *pgxpool.Pool) int64 {
	t.Helper()
	var cents int64
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT COALESCE(SUM(round(amount*100))::bigint,0) FROM public.refund
		  WHERE order_id = $1 AND status IN ('submitted','succeeded','failed')`, orderID).Scan(&cents))
	return cents
}
