package checkout

import (
	"context"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

// Container-backed proofs for 054 US3 — the reduction and the oversell (FR-021, FR-022, SC-003).
//
// ⚠ THESE CANNOT BE UNIT TESTS. The guarantees are not in Go: the floor is `GREATEST(0, ...)` inside
// an UPDATE, and the serialisation is the ROW LOCK PostgreSQL takes on it. A fake store would happily
// let two goroutines both read 1 and both write 0, proving nothing about the thing that actually
// protects the shopper.
//
// ⚠ SC-003 — TWO PAYMENTS FOR THE LAST UNIT — IS THE SINGLE MOST IMPORTANT UNVERIFIED CLAIM IN THIS
// SLICE, and it lives here. 052 lost an entire session's exactly-once proofs to a silent skip when
// Docker was down; run `docker info` before trusting a green suite that includes this file.

func stockSchema(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	for _, stmt := range []string{
		`CREATE TABLE shop (id uuid PRIMARY KEY)`,
		`CREATE TABLE "order" (id uuid PRIMARY KEY)`,
		`CREATE TABLE product (
			id            uuid PRIMARY KEY,
			shop_id       uuid NOT NULL REFERENCES shop (id),
			stock_tracked boolean NOT NULL DEFAULT false,
			stock_on_hand int,
			CONSTRAINT product_stock_on_hand_ck CHECK (stock_on_hand IS NULL OR stock_on_hand >= 0),
			CONSTRAINT product_stock_tracked_needs_count_ck
				CHECK (NOT stock_tracked OR stock_on_hand IS NOT NULL)
		)`,
		`CREATE TABLE order_item (
			id         uuid PRIMARY KEY,
			order_id   uuid NOT NULL REFERENCES "order" (id),
			product_id uuid NOT NULL REFERENCES product (id),
			shop_id    uuid NOT NULL REFERENCES shop (id),
			quantity   int NOT NULL CHECK (quantity > 0)
		)`,
		`CREATE TABLE stock_movement (
			id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			product_id      uuid NOT NULL REFERENCES product (id),
			shop_id         uuid NOT NULL REFERENCES shop (id),
			quantity_delta  int NOT NULL,
			quantity_before int NOT NULL CHECK (quantity_before >= 0),
			quantity_after  int NOT NULL CHECK (quantity_after >= 0),
			reason          text NOT NULL,
			actor_kind      text NOT NULL CHECK (actor_kind IN ('shop','back_office','system')),
			actor_sub       text,
			order_id        uuid REFERENCES "order" (id),
			created_at      timestamptz NOT NULL DEFAULT now(),
			CONSTRAINT stock_movement_system_is_anonymous_ck
				CHECK (actor_kind <> 'system' OR actor_sub IS NULL)
		)`,
	} {
		_, err := pool.Exec(ctx, stmt)
		require.NoError(t, err, stmt)
	}
}

const (
	stockShopID  = "22222222-2222-4222-8222-222222222222"
	stockProduct = "33333333-3333-4333-8333-333333333333"
)

func seedStock(t *testing.T, pool *pgxpool.Pool, onHand int) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO shop (id) VALUES ($1)`, stockShopID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO product (id, shop_id, stock_tracked, stock_on_hand) VALUES ($1, $2, true, $3)`,
		stockProduct, stockShopID, onHand)
	require.NoError(t, err)
}

func seedStockOrder(t *testing.T, pool *pgxpool.Pool, orderID string, qty int) {
	t.Helper()
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO "order" (id) VALUES ($1)`, orderID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx,
		`INSERT INTO order_item (id, order_id, product_id, shop_id, quantity)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
		orderID, stockProduct, stockShopID, qty)
	require.NoError(t, err)
}

// The EXACT statement FinalizeSucceeded issues, so this exercises the real thing rather than a
// paraphrase that could drift from it.
const reduceStock = `
WITH ordered AS (
    SELECT oi.product_id, oi.shop_id, SUM(oi.quantity)::int AS qty
      FROM order_item oi
     WHERE oi.order_id = $1
     GROUP BY oi.product_id, oi.shop_id
), prev AS (
    SELECT p.id, o.shop_id, p.stock_on_hand, o.qty
      FROM product p
      JOIN ordered o ON o.product_id = p.id
     WHERE p.stock_tracked
     ORDER BY p.id
     FOR UPDATE OF p
), moved AS (
    UPDATE product p
       SET stock_on_hand = GREATEST(0, prev.stock_on_hand - prev.qty)
      FROM prev
     WHERE p.id = prev.id
    RETURNING p.id, prev.shop_id, prev.stock_on_hand AS before, p.stock_on_hand AS after
)
INSERT INTO stock_movement
    (product_id, shop_id, quantity_delta, quantity_before, quantity_after, reason, actor_kind, actor_sub, order_id)
SELECT id, shop_id, after - before, before, after, 'order_paid', 'system', NULL, $1
  FROM moved`

func onHandNow(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT stock_on_hand FROM product WHERE id = $1`, stockProduct).Scan(&n))
	return n
}

func movementCount(t *testing.T, pool *pgxpool.Pool) int {
	t.Helper()
	var n int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT count(*) FROM stock_movement WHERE product_id = $1`, stockProduct).Scan(&n))
	return n
}

func TestStock_PaidOrderReducesTheCountAndRecordsWhy(t *testing.T) {
	pool := startPostgresForReceipts(t)
	stockSchema(t, pool)
	seedStock(t, pool, 10)
	const orderID = "44444444-4444-4444-8444-444444444444"
	seedStockOrder(t, pool, orderID, 3)

	_, err := pool.Exec(context.Background(), reduceStock, orderID)
	require.NoError(t, err)

	require.Equal(t, 7, onHandNow(t, pool), "10 - 3")
	require.Equal(t, 1, movementCount(t, pool), "the deduction must be explicable from the history (SC-005)")

	var before, after, delta int
	var reason, actorKind string
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT quantity_before, quantity_after, quantity_delta, reason, actor_kind
		   FROM stock_movement WHERE product_id = $1`, stockProduct).
		Scan(&before, &after, &delta, &reason, &actorKind))
	require.Equal(t, 10, before)
	require.Equal(t, 7, after)
	require.Equal(t, -3, delta)
	require.Equal(t, "order_paid", reason)
	require.Equal(t, "system", actorKind, "the paid path has no person behind it")
}

// ⚠ FR-021. In production the status guard at the top of FinalizeSucceeded makes this unreachable —
// a redelivered webhook returns early. This proves what happens if that guard were ever relaxed:
// the deduction is NOT self-idempotent, so the guard is load-bearing and must stay.
func TestStock_TheDeductionItselfIsNotIdempotent_TheStatusGuardIsWhatMakesItSo(t *testing.T) {
	pool := startPostgresForReceipts(t)
	stockSchema(t, pool)
	seedStock(t, pool, 10)
	const orderID = "44444444-4444-4444-8444-444444444445"
	seedStockOrder(t, pool, orderID, 3)

	ctx := context.Background()
	_, err := pool.Exec(ctx, reduceStock, orderID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, reduceStock, orderID)
	require.NoError(t, err)

	require.Equal(t, 4, onHandNow(t, pool),
		"running the statement twice deducts twice — which is exactly why FinalizeSucceeded's "+
			"status-guarded transition must remain the thing that makes it exactly-once")
}

// ⚠⚠ SC-003 — THE DELIBERATE OVERSELL. Two shoppers pay for the last unit at the same instant.
//
// This is the single most important proof in the slice: it is the case the whole feature exists for,
// and the one that has never happened on this platform. The count must never go below zero, both
// orders must be recorded, and the history must account for both.
func TestStock_TwoConcurrentPaymentsForTheLastUnitNeverDriveTheCountNegative(t *testing.T) {
	pool := startPostgresForReceipts(t)
	stockSchema(t, pool)
	seedStock(t, pool, 1)

	const orderA = "55555555-5555-4555-8555-555555555551"
	const orderB = "55555555-5555-4555-8555-555555555552"
	seedStockOrder(t, pool, orderA, 1)
	seedStockOrder(t, pool, orderB, 1)

	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, id := range []string{orderA, orderB} {
		wg.Add(1)
		go func(i int, orderID string) {
			defer wg.Done()
			_, errs[i] = pool.Exec(context.Background(), reduceStock, orderID)
		}(i, id)
	}
	wg.Wait()

	require.NoError(t, errs[0])
	require.NoError(t, errs[1])

	// The floor is in the statement, and the row lock serialises the two writers.
	require.Equal(t, 0, onHandNow(t, pool), "the count must never read below zero (FR-022)")

	// Both orders are recorded — one took the unit, the other found the shelf empty. The second
	// movement is a real event (`1 → 0` then `0 → 0`), not a lost write.
	require.Equal(t, 2, movementCount(t, pool), "both payments must appear in the history")

	var minAfter int
	require.NoError(t, pool.QueryRow(context.Background(),
		`SELECT min(quantity_after) FROM stock_movement WHERE product_id = $1`, stockProduct).Scan(&minAfter))
	require.GreaterOrEqual(t, minAfter, 0, "no movement may record a negative count")
}

// ⚠ PROVEN BY BREAKING IT (quickstart §2d). Without `GREATEST(0, ...)` the same concurrency drives
// the count negative — and the CHECK constraint is the last line of defence, so the write fails
// outright rather than silently corrupting. Either way the shopper is harmed; the floor prevents both.
func TestStock_WithoutTheFloorTheConcurrentCaseBreaks(t *testing.T) {
	pool := startPostgresForReceipts(t)
	stockSchema(t, pool)
	seedStock(t, pool, 1)

	const orderA = "66666666-6666-4666-8666-666666666661"
	const orderB = "66666666-6666-4666-8666-666666666662"
	seedStockOrder(t, pool, orderA, 1)
	seedStockOrder(t, pool, orderB, 1)

	noFloor := `
WITH ordered AS (
    SELECT oi.product_id, SUM(oi.quantity)::int AS qty
      FROM order_item oi WHERE oi.order_id = $1 GROUP BY oi.product_id
)
UPDATE product p SET stock_on_hand = p.stock_on_hand - o.qty
  FROM ordered o WHERE p.id = o.product_id AND p.stock_tracked`

	ctx := context.Background()
	_, err := pool.Exec(ctx, noFloor, orderA)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, noFloor, orderB)
	require.Error(t, err, "without the floor the second payment violates product_stock_on_hand_ck — "+
		"the database refuses, which is why the floor belongs in the statement rather than in a service branch")
}

func TestStock_UntrackedProductsProduceNoMovementAtAll(t *testing.T) {
	pool := startPostgresForReceipts(t)
	stockSchema(t, pool)
	ctx := context.Background()
	_, err := pool.Exec(ctx, `INSERT INTO shop (id) VALUES ($1)`, stockShopID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO product (id, shop_id) VALUES ($1, $2)`, stockProduct, stockShopID)
	require.NoError(t, err)

	const orderID = "77777777-7777-4777-8777-777777777777"
	seedStockOrder(t, pool, orderID, 3)

	_, err = pool.Exec(ctx, reduceStock, orderID)
	require.NoError(t, err)

	require.Equal(t, 0, movementCount(t, pool),
		"an untracked product must gain no history — FR-024, and the SC-006 promise that it behaves exactly as before")
}
