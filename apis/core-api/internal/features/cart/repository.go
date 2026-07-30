// Repository layer: SQL only. The server cart stores ONLY product + quantity + the price the line was
// added at; the price a shopper is CHARGED is always re-read from public.product at read time (019 R8,
// unchanged). One cart per customer.
//
// ── Two rules every mutation in this file obeys (027) ────────────────────────────────────────────
//
//  1. It runs in a TRANSACTION, and that transaction carries the `cart.revision` bump and the
//     `cart_change_log` guard with it. The bump cannot be skipped, because a mutation the client cannot
//     detect is a mutation the client's mirror will happily overwrite. The guard cannot be a
//     check-then-write, because that is a race — hence one transaction, not two statements.
//
//  2. It is IDEMPOTENT, or it carries a change id. Quantities are absolute; merge and reorder take the
//     MAXIMUM, never a sum. The single exception is AddItem, which must increment, and which therefore
//     always has a change id to dedupe on.
//
// ⚠ The whole-cart replace (019's `ReplaceItems`, the `PUT /v1/cart` backing) is GONE. It is replaced by
// MergeItems, which has no "delete what is absent" clause — that clause is what let a stale device wipe
// lines it had never heard of, and its absence is what makes 027 FR-010 structural (research R0).
package cart

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// cartLineRow is the wire shape of a cart read (cart_item ⋈ product ⋈ primary media). The same shape
// serves set-aside lines, because they are the same thing shown in a different place.
type cartLineRow struct {
	ID              string  `db:"id"`
	ProductID       string  `db:"product_id"`
	ShopID          string  `db:"shop_id"`
	Quantity        int     `db:"quantity"`
	Name            string  `db:"name"`
	UnitPriceAmount string  `db:"unit_price_amount"`
	Currency        string  `db:"currency"`
	Status          string  `db:"status"`
	StorageKey      *string `db:"storage_key"`
	// The price when the line was added — NULL for a line predating 027, and NULL is not "unchanged",
	// it is "unknown" (the service must not fabricate a price-change notice from it).
	UnitPriceAtAdd *string   `db:"unit_price_at_add"`
	AddedAt        time.Time `db:"added_at"`
}

// allLinesRow is one row of the combined read: a line, which set it belongs to, and the cart's revision.
type allLinesRow struct {
	Revision int64 `db:"revision"`
	Saved    bool  `db:"saved"`
	cartLineRow
}

// cartMetaRow is everything about a cart that is not a line.
type cartMetaRow struct {
	Revision    int64   `db:"revision"`
	PromoCodeID *string `db:"promo_code_id"`
}

// CartMeta is the domain view of the above.
type CartMeta struct {
	Revision    int64
	PromoCodeID string // "" when no code is applied
}

// productStatusRow is the availability + price probe used when adding, restoring, or previewing.
type productStatusRow struct {
	Status      string `db:"status"`
	PriceAmount string `db:"price_amount"`
}

type Repository struct {
	pool *pgxpool.Pool
}

// NewRepository takes the pool (not the narrower db.DBTX) because every mutation here owns a
// transaction: the revision bump and the change guard must commit or fail with the mutation itself.
func NewRepository(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

// The projection shared by the cart-line and saved-line reads. Kept in one place so the two cannot
// drift: a saved line that rendered differently from a cart line would be a bug nobody would spot.
const lineProjection = `
       ci.id::text            AS id,
       ci.product_id::text    AS product_id,
       p.shop_id::text        AS shop_id,
       ci.quantity            AS quantity,
       p.name                 AS name,
       p.price_amount::text   AS unit_price_amount,
       p.currency             AS currency,
       p.status               AS status,
       ci.unit_price_at_add::text AS unit_price_at_add,
       ci.added_at            AS added_at,
       m.storage_key          AS storage_key`

const primaryMediaJoin = `
LEFT JOIN LATERAL (
    SELECT storage_key FROM public.product_media
    WHERE product_id = p.id
    ORDER BY is_primary DESC, display_order ASC, created_at ASC
    LIMIT 1
) m ON true`

// ── Reads ───────────────────────────────────────────────────────────────────────────────────────

// GetOrCreateCartID returns the customer's cart id, creating the cart on first use.
//
// ⚠ It deliberately does NOT bump the revision on the conflict path. Reading a cart is not a change, and
// a bump here would make every read look like a mutation to every other device.
func (r *Repository) GetOrCreateCartID(ctx context.Context, customerID string) (string, error) {
	rows, err := r.pool.Query(ctx, `
INSERT INTO public.cart (customer_id) VALUES ($1)
ON CONFLICT (customer_id) DO UPDATE SET customer_id = public.cart.customer_id
RETURNING id::text`, customerID)
	if err != nil {
		return "", fmt.Errorf("cart: upsert cart: %w", err)
	}
	id, err := pgx.CollectExactlyOneRow(rows, pgx.RowTo[string])
	if err != nil {
		return "", fmt.Errorf("cart: scan cart id: %w", err)
	}
	return id, nil
}

// Meta reads the cart's revision and applied promo code.
func (r *Repository) Meta(ctx context.Context, cartID string) (CartMeta, error) {
	rows, err := r.pool.Query(ctx, `
SELECT revision AS revision, promo_code_id::text AS promo_code_id
FROM public.cart WHERE id = $1`, cartID)
	if err != nil {
		return CartMeta{}, fmt.Errorf("cart: query meta: %w", err)
	}
	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[cartMetaRow])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return CartMeta{}, nil
		}
		return CartMeta{}, fmt.Errorf("cart: scan meta: %w", err)
	}
	meta := CartMeta{Revision: row.Revision}
	if row.PromoCodeID != nil {
		meta.PromoCodeID = *row.PromoCodeID
	}
	return meta, nil
}

// Lines returns the cart's payable lines, re-priced against product, oldest first (a stable order, so a
// restored cart looks like the cart the shopper left — FR-002).
func (r *Repository) Lines(ctx context.Context, cartID string) ([]cartLineRow, error) {
	return r.linesFrom(ctx, "public.cart_item", cartID)
}

// SavedLines returns the set-aside lines. Same projection, different table — and the fact that it IS a
// different table is what keeps saved items out of every query that computes money (research R5).
func (r *Repository) SavedLines(ctx context.Context, cartID string) ([]cartLineRow, error) {
	return r.linesFrom(ctx, "public.cart_saved_item", cartID)
}

// AllLines returns the payable lines AND the set-aside lines in ONE round trip, plus the cart's revision.
//
// ⚠ This exists for latency, and the latency is not theoretical: building a cart used to cost three
// separate queries (lines, saved lines, meta), and against a remote database that was enough to push the
// add path past its timeout and 500. One statement, one trip. The `saved` discriminator is what keeps the
// two sets apart in Go — they are still separate TABLES, so a query that forgets about saved items still
// cannot see them (research R5).
func (r *Repository) AllLines(ctx context.Context, cartID string) (lines, saved []cartLineRow, revision int64, err error) {
	rows, err := r.pool.Query(ctx, `
SELECT c.revision AS revision, false AS saved,`+lineProjection+`
FROM public.cart c
JOIN public.cart_item ci ON ci.cart_id = c.id
JOIN public.product p ON p.id = ci.product_id`+primaryMediaJoin+`
WHERE c.id = $1
UNION ALL
SELECT c.revision AS revision, true AS saved,`+lineProjection+`
FROM public.cart c
JOIN public.cart_saved_item ci ON ci.cart_id = c.id
JOIN public.product p ON p.id = ci.product_id`+primaryMediaJoin+`
WHERE c.id = $1
ORDER BY saved, added_at ASC, id ASC`, cartID)
	if err != nil {
		return nil, nil, 0, fmt.Errorf("cart: query all lines: %w", err)
	}
	all, err := pgx.CollectRows(rows, pgx.RowToStructByName[allLinesRow])
	if err != nil {
		return nil, nil, 0, fmt.Errorf("cart: scan all lines: %w", err)
	}
	for _, row := range all {
		revision = row.Revision
		if row.Saved {
			saved = append(saved, row.cartLineRow)
		} else {
			lines = append(lines, row.cartLineRow)
		}
	}
	// An EMPTY cart returns no rows at all, so the revision has to come from somewhere. One extra trip,
	// and only for a cart with nothing in it — where nothing else is being read anyway.
	if len(all) == 0 {
		meta, mErr := r.Meta(ctx, cartID)
		if mErr != nil {
			return nil, nil, 0, mErr
		}
		revision = meta.Revision
	}
	return lines, saved, revision, nil
}

func (r *Repository) linesFrom(ctx context.Context, table, cartID string) ([]cartLineRow, error) {
	// `table` is one of two package-private constants above — never caller input.
	rows, err := r.pool.Query(ctx, `
SELECT`+lineProjection+`
FROM `+table+` ci
JOIN public.product p ON p.id = ci.product_id`+primaryMediaJoin+`
WHERE ci.cart_id = $1
ORDER BY ci.added_at ASC, ci.id ASC`, cartID)
	if err != nil {
		return nil, fmt.Errorf("cart: query lines from %s: %w", table, err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[cartLineRow])
	if err != nil {
		return nil, fmt.Errorf("cart: scan lines from %s: %w", table, err)
	}
	return out, nil
}

// CountDistinct is the number of distinct products in the payable cart — the value the cart-size ceiling
// is applied to (FR-038). Saved items do not count against it: setting something aside must not make the
// cart harder to add to.
func (r *Repository) CountDistinct(ctx context.Context, cartID string) (int, error) {
	rows, err := r.pool.Query(ctx, `SELECT count(*)::int FROM public.cart_item WHERE cart_id = $1`, cartID)
	if err != nil {
		return 0, fmt.Errorf("cart: count distinct: %w", err)
	}
	n, err := pgx.CollectExactlyOneRow(rows, pgx.RowTo[int])
	if err != nil {
		return 0, fmt.Errorf("cart: scan distinct count: %w", err)
	}
	return n, nil
}

// ProductStatus returns the product's lifecycle status and current price; found=false if the row does
// not exist (only reachable on the guest preview path — see research R11).
func (r *Repository) ProductStatus(ctx context.Context, productID string) (string, string, bool, error) {
	rows, err := r.pool.Query(ctx, `
SELECT status AS status, price_amount::text AS price_amount
FROM public.product WHERE id = $1`, productID)
	if err != nil {
		return "", "", false, fmt.Errorf("cart: query product status: %w", err)
	}
	row, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByName[productStatusRow])
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", false, nil
		}
		return "", "", false, fmt.Errorf("cart: scan product status: %w", err)
	}
	return row.Status, row.PriceAmount, true, nil
}

// ProductSnapshots reads the catalogue rows for an arbitrary set of product ids, in the SAME shape as a
// cart line but with no cart involved. It backs `POST /v1/cart/preview`: a guest has no server cart, but
// FR-004/FR-021/FR-022 still apply to them, so their device lines are priced here — with zero writes.
// Ids that do not resolve are simply absent from the result, which is how the service reports `removed`.
func (r *Repository) ProductSnapshots(ctx context.Context, productIDs []string) ([]cartLineRow, error) {
	if len(productIDs) == 0 {
		return nil, nil
	}
	rows, err := r.pool.Query(ctx, `
SELECT ''::text              AS id,
       p.id::text            AS product_id,
       p.shop_id::text       AS shop_id,
       0                     AS quantity,
       p.name                AS name,
       p.price_amount::text  AS unit_price_amount,
       p.currency            AS currency,
       p.status              AS status,
       NULL::text            AS unit_price_at_add,
       m.storage_key         AS storage_key
FROM public.product p`+primaryMediaJoin+`
WHERE p.id = ANY($1::uuid[])`, productIDs)
	if err != nil {
		return nil, fmt.Errorf("cart: query product snapshots: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[cartLineRow])
	if err != nil {
		return nil, fmt.Errorf("cart: scan product snapshots: %w", err)
	}
	return out, nil
}

// OrderItemsForReorder reads a past order's items for a reorder, ownership-checked in the same query so
// another customer's order is indistinguishable from a missing one (FR: 404, never 403).
func (r *Repository) OrderItemsForReorder(ctx context.Context, customerID, orderID string) ([]ReorderCandidate, bool, error) {
	rows, err := r.pool.Query(ctx, `
SELECT oi.product_id::text AS product_id,
       oi.quantity         AS quantity,
       oi.product_name     AS name,
       p.status            AS status
FROM public."order" o
JOIN public.order_item oi ON oi.order_id = o.id
LEFT JOIN public.product p ON p.id = oi.product_id
WHERE o.id = $1 AND o.customer_id = $2
ORDER BY oi.id ASC`, orderID, customerID)
	if err != nil {
		return nil, false, fmt.Errorf("cart: query order items: %w", err)
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByName[ReorderCandidate])
	if err != nil {
		return nil, false, fmt.Errorf("cart: scan order items: %w", err)
	}
	// No rows means either "not this customer's order" or "no such order". Both are a 404, deliberately.
	return out, len(out) > 0, nil
}

// ReorderCandidate is one item of a past order, with the product's status today.
type ReorderCandidate struct {
	ProductID string  `db:"product_id"`
	Quantity  int     `db:"quantity"`
	Name      string  `db:"name"`
	Status    *string `db:"status"` // NULL when the product row is gone
}

// ── Mutations ───────────────────────────────────────────────────────────────────────────────────
//
// Every one returns `applied`: false means the change id had already been recorded for this cart, so
// nothing was done and the caller should return the CURRENT cart (FR-018). All of them bump the revision.

// inTx runs fn in a transaction, applying the change guard first. When changeID is empty the guard is
// skipped (the operation is idempotent and needs none); when it is set and already recorded, fn is never
// called and applied=false comes back.
func (r *Repository) inTx(ctx context.Context, cartID, changeID string, fn func(pgx.Tx) error) (bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("cart: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if changeID != "" {
		ok, err := markChangeApplied(ctx, tx, cartID, changeID)
		if err != nil {
			return false, err
		}
		if !ok {
			// Already applied. Commit so the (no-op) transaction closes cleanly.
			if err := tx.Commit(ctx); err != nil {
				return false, fmt.Errorf("cart: commit no-op: %w", err)
			}
			return false, nil
		}
	}

	if err := fn(tx); err != nil {
		return false, err
	}
	if err := bumpRevision(ctx, tx, cartID); err != nil {
		return false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("cart: commit: %w", err)
	}
	return true, nil
}

// markChangeApplied records a client change id, returning false if it was already there. The insert is
// in the mutation's own transaction ON PURPOSE: checking first and mutating second is a race that shows
// up exactly when it matters, under a retry storm.
func markChangeApplied(ctx context.Context, tx pgx.Tx, cartID, changeID string) (bool, error) {
	tag, err := tx.Exec(ctx, `
INSERT INTO public.cart_change_log (cart_id, change_id) VALUES ($1, $2)
ON CONFLICT (cart_id, change_id) DO NOTHING`, cartID, changeID)
	if err != nil {
		return false, fmt.Errorf("cart: mark change applied: %w", err)
	}
	// ⚠ NO PRUNE HERE. It used to run a second DELETE on every guarded write, and against a remote
	// database that is a whole extra round trip on the shopper's critical path — which is precisely how
	// the add path came to blow its timeout (the rows are tiny; the latency is not). Retention is a
	// housekeeping concern, not a request-time one; see the note on the table in data-model.md §5.
	return tag.RowsAffected() > 0, nil
}

// bumpRevision advances the cart's revision. Called by inTx for every mutation, so no code path can
// forget it.
func bumpRevision(ctx context.Context, tx pgx.Tx, cartID string) error {
	if _, err := tx.Exec(ctx, `
UPDATE public.cart SET revision = revision + 1, updated_at = now() WHERE id = $1`, cartID); err != nil {
		return fmt.Errorf("cart: bump revision: %w", err)
	}
	return nil
}

// AddItem inserts or INCREMENTS a line, clamping to max. The add-time price is recorded on insert and
// deliberately left alone on the increment path: the price the shopper first chose the item at is the one
// worth reporting a change against.
func (r *Repository) AddItem(ctx context.Context, cartID, productID, changeID string, qty, max int) (bool, error) {
	return r.inTx(ctx, cartID, changeID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
INSERT INTO public.cart_item (cart_id, product_id, quantity, unit_price_at_add)
SELECT $1, $2, $3, p.price_amount FROM public.product p WHERE p.id = $2
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = LEAST(public.cart_item.quantity + EXCLUDED.quantity, $4), updated_at = now()`,
			cartID, productID, qty, max)
		if err != nil {
			return fmt.Errorf("cart: add item: %w", err)
		}
		return nil
	})
}

// SetQty sets a line's ABSOLUTE quantity (the caller has clamped it and handled qty <= 0 as a removal).
// Absolute is what lets the client debounce ten taps into one request and drop the intermediate values.
func (r *Repository) SetQty(ctx context.Context, cartID, productID, changeID string, qty int) (bool, error) {
	return r.inTx(ctx, cartID, changeID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
UPDATE public.cart_item SET quantity = $3, updated_at = now()
WHERE cart_id = $1 AND product_id = $2`, cartID, productID, qty)
		if err != nil {
			return fmt.Errorf("cart: set qty: %w", err)
		}
		return nil
	})
}

// RemoveItem deletes a payable line.
func (r *Repository) RemoveItem(ctx context.Context, cartID, productID, changeID string) (bool, error) {
	return r.inTx(ctx, cartID, changeID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`DELETE FROM public.cart_item WHERE cart_id = $1 AND product_id = $2`, cartID, productID)
		if err != nil {
			return fmt.Errorf("cart: remove item: %w", err)
		}
		return nil
	})
}

// DeleteAllItems empties the payable cart. ⚠ `cart_saved_item` is NOT touched: clearing the cart must
// never throw away what the shopper deliberately set aside (FR-030). The applied promo code is dropped
// too — a discount on an empty cart is meaningless.
func (r *Repository) DeleteAllItems(ctx context.Context, cartID, changeID string) (bool, error) {
	return r.inTx(ctx, cartID, changeID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM public.cart_item WHERE cart_id = $1`, cartID); err != nil {
			return fmt.Errorf("cart: clear items: %w", err)
		}
		if _, err := tx.Exec(ctx, `
UPDATE public.cart SET promo_code_id = NULL, promo_applied_at = NULL WHERE id = $1`, cartID); err != nil {
			return fmt.Errorf("cart: clear promo on empty: %w", err)
		}
		return nil
	})
}

// DeleteLines removes specific lines without a change id — used for the `archived`/`removed` sweep the
// service performs while building a cart (research R11), not for a shopper action.
func (r *Repository) DeleteLines(ctx context.Context, cartID string, productIDs []string) error {
	if len(productIDs) == 0 {
		return nil
	}
	_, err := r.inTx(ctx, cartID, "", func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`DELETE FROM public.cart_item WHERE cart_id = $1 AND product_id = ANY($2::uuid[])`, cartID, productIDs)
		if err != nil {
			return fmt.Errorf("cart: delete lines: %w", err)
		}
		return nil
	})
	return err
}

// MergeItems folds a client-supplied line set into the cart: every product from either side is present,
// and a product on both takes the GREATER quantity, clamped to max.
//
// ⚠ Union with MAXIMUM — not a sum (019's original merge summed, and tripled carts on 2026-07-23), and
// with NO "delete what is absent" clause (019's replacement deleted, and let a stale device clobber).
// Taking the maximum makes this idempotent AND commutative: run it twice, or from two devices in either
// order, and the cart is the same. That is what FR-012 asks for.
func (r *Repository) MergeItems(ctx context.Context, cartID, changeID string, productIDs []string, quantities []int32, max int) (bool, error) {
	return r.inTx(ctx, cartID, changeID, func(tx pgx.Tx) error {
		if len(productIDs) == 0 {
			return nil // merging nothing is a legitimate no-op: an empty guest cart must not empty the account cart
		}
		_, err := tx.Exec(ctx, `
INSERT INTO public.cart_item (cart_id, product_id, quantity, unit_price_at_add)
SELECT $1, t.product_id, LEAST(t.quantity, $4), p.price_amount
FROM unnest($2::uuid[], $3::int[]) AS t(product_id, quantity)
JOIN public.product p ON p.id = t.product_id
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = LEAST(GREATEST(public.cart_item.quantity, EXCLUDED.quantity), $4),
              updated_at = now()`,
			cartID, productIDs, quantities, max)
		if err != nil {
			return fmt.Errorf("cart: merge items: %w", err)
		}
		return nil
	})
}

// SetAside moves a payable line into the saved list. Two statements in one transaction, so the product
// is never in both tables and never in neither.
func (r *Repository) SetAside(ctx context.Context, cartID, productID, changeID string) (bool, error) {
	return r.inTx(ctx, cartID, changeID, func(tx pgx.Tx) error {
		// The add-time price travels with the line, so a price change is still reported while it is aside.
		if _, err := tx.Exec(ctx, `
INSERT INTO public.cart_saved_item (cart_id, product_id, quantity, unit_price_at_add)
SELECT cart_id, product_id, quantity, unit_price_at_add
FROM public.cart_item WHERE cart_id = $1 AND product_id = $2
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = GREATEST(public.cart_saved_item.quantity, EXCLUDED.quantity), updated_at = now()`,
			cartID, productID); err != nil {
			return fmt.Errorf("cart: set aside insert: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`DELETE FROM public.cart_item WHERE cart_id = $1 AND product_id = $2`, cartID, productID); err != nil {
			return fmt.Errorf("cart: set aside delete: %w", err)
		}
		return nil
	})
}

// RestoreSaved moves a saved line back into the payable cart AT THE CURRENT PRICE (FR-029) — the
// add-time price is reset to today's, so the shopper is not shown a stale "price changed" note about a
// decision they have just re-made.
func (r *Repository) RestoreSaved(ctx context.Context, cartID, productID, changeID string, max int) (bool, error) {
	return r.inTx(ctx, cartID, changeID, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
INSERT INTO public.cart_item (cart_id, product_id, quantity, unit_price_at_add)
SELECT s.cart_id, s.product_id, LEAST(s.quantity, $3), p.price_amount
FROM public.cart_saved_item s
JOIN public.product p ON p.id = s.product_id
WHERE s.cart_id = $1 AND s.product_id = $2
ON CONFLICT (cart_id, product_id)
DO UPDATE SET quantity = LEAST(GREATEST(public.cart_item.quantity, EXCLUDED.quantity), $3),
              updated_at = now()`,
			cartID, productID, max); err != nil {
			return fmt.Errorf("cart: restore insert: %w", err)
		}
		if _, err := tx.Exec(ctx,
			`DELETE FROM public.cart_saved_item WHERE cart_id = $1 AND product_id = $2`, cartID, productID); err != nil {
			return fmt.Errorf("cart: restore delete: %w", err)
		}
		return nil
	})
}

// DeleteSaved discards a saved line outright.
func (r *Repository) DeleteSaved(ctx context.Context, cartID, productID, changeID string) (bool, error) {
	return r.inTx(ctx, cartID, changeID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx,
			`DELETE FROM public.cart_saved_item WHERE cart_id = $1 AND product_id = $2`, cartID, productID)
		if err != nil {
			return fmt.Errorf("cart: delete saved: %w", err)
		}
		return nil
	})
}
