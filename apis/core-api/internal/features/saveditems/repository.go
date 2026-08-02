// Package saveditems is the customer's saved-items WATCHLIST (033). It replaces the retired
// `favorites` package entirely.
//
// Two defects in the predecessor shaped this one, and both are fixed here rather than in the clients:
//
//  1. Nothing could answer "is this product already saved?", so every surface assumed NOT SAVED on
//     every render — and a shopper's second tap silently un-saved what they were trying to save.
//     MembershipIDs is that answer, delivered ONCE per screen rather than once per product.
//  2. The list called a product available whenever `status = 'active'`, which is not the same
//     question as "can this shopper buy it". List answers the five-way verdict instead, against the
//     shopper's actual delivery location.
//
// ⚠ NOT the cart's set-aside (`public.cart_saved_item`, 027) — a bookmark, not a heart.
package saveditems

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Repository layer: SQL only. Row structs are mapped to domain in the service; they never leave
// this file.

var (
	// ErrProductNotFound — you cannot watch a product that does not exist.
	ErrProductNotFound = errors.New("saveditems: product not found")
	// ErrCapReached — the shopper is at the cap. ⚠ Refused, NEVER resolved by evicting something the
	// shopper deliberately saved (FR-047).
	ErrCapReached = errors.New("saveditems: cap reached")
)

// Repository takes the pool rather than the narrower db.DBTX because Save owns a transaction: the
// cap check and the insert must commit or fail together, or the cap is not a cap (cart/repository.go
// takes the pool for the same reason).
type Repository struct{ pool *pgxpool.Pool }

func NewRepository(p *pgxpool.Pool) *Repository { return &Repository{pool: p} }

// inTx runs fn in a transaction, rolling back on any error.
func (r *Repository) inTx(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("saveditems: begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("saveditems: commit: %w", err)
	}
	return nil
}

// ── Membership: the read that makes the heart tell the truth ────────────────────────────────────

const membershipSQL = `
SELECT product_id::text
FROM public.customer_saved_item
WHERE customer_id = $1
ORDER BY saved_at DESC`

// MembershipIDs returns the shopper's whole set of saved product ids.
//
// ⚠ Served by the PRIMARY KEY index alone (customer_id leads it), and bounded by the cap — which is
// exactly what makes a whole-set read cheap enough to issue once per screen instead of once per tile
// (FR-019/FR-020).
func (r *Repository) MembershipIDs(ctx context.Context, customerID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, membershipSQL, customerID)
	if err != nil {
		return nil, fmt.Errorf("saveditems: membership: %w", err)
	}
	defer rows.Close()

	ids := make([]string, 0, 32)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("saveditems: scan membership: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// ── The list, with the five-way verdict, in ONE statement ───────────────────────────────────────

// listSQL answers the whole saved list AND its purchasability against one destination zone.
//
// ⚠ ONE STATEMENT, NOT ONE PER ITEM. A Sydney RDS round trip measures ~135 ms from a local core-api,
// so a per-item query at the 200-item cap would cost ~27 s against SC-006's 2 s budget. 029's /home
// 503 (8 serial queries, failing at exactly 3.007 s) is the standing precedent.
//
// ⚠ THE ORDER OF THE CASE ARMS IS PART OF THE MODEL, not an implementation detail:
//
//   - `archived` is tested FIRST, before the destination test, so a withdrawn product reads
//     "no longer sold" even for a shopper who has not said where they live. Of the two true things
//     we could say, that is the more informative one.
//   - `not_yet_determined` comes next, before the remaining status distinctions — otherwise we would
//     imply we had checked delivery when we had no address to check against.
//   - "not delivered to your area" is the ELSE, so a product only earns it once we know the product
//     is sellable and the shopper's location is known. It is never a fallback for "something failed".
//
// The EXISTS block is the same four-term predicate delivery.Purchasable implements, inlined here
// because pulling 200 products through a per-row function call would defeat the point of the single
// statement. ⚠ If you change one, change both — the divergence between the storefront's answer and
// checkout's is precisely the defect 033 exists to remove.
const listSQL = `
SELECT s.product_id::text                        AS product_id,
       p.name                                    AS name,
       p.brand                                   AS brand,
       p.price_amount::text                      AS price_amount,
       p.currency                                AS currency,
       p.compare_at_amount::text                 AS compare_at_amount,
       m.storage_key                             AS storage_key,
       m.alt_text                                AS alt_text,
       s.saved_at                                AS saved_at,
       s.saved_price_amount::text                AS saved_price_amount,
       c.key                                     AS category_key,
       p.created_at >= now() - interval '14 days' AS is_new,
       (p.currency = s.saved_currency AND p.price_amount < s.saved_price_amount) AS price_dropped,
       CASE
         WHEN p.status = 'archived' THEN 'no_longer_sold'
         WHEN $2::uuid IS NULL      THEN 'not_yet_determined'
         WHEN p.status <> 'active'  THEN 'temporarily_unavailable'
         WHEN EXISTS (
             SELECT 1
               FROM public.shop sh
               JOIN public.delivery_zone_postcode oz ON oz.postcode = sh.postcode
               JOIN public.delivery_offering o
                 ON o.origin_zone_id = oz.zone_id
                AND o.destination_zone_id = $2::uuid
                AND o.status = 'active'
               JOIN public.delivery_pricing_rule r
                 ON r.method = o.method AND r.status = 'active'
              WHERE sh.id = p.shop_id
         ) THEN 'purchasable'
         ELSE 'not_delivered_to_your_area'
       END                                       AS verdict
FROM public.customer_saved_item s
JOIN public.product p ON p.id = s.product_id
LEFT JOIN public.category c ON c.id = p.primary_category_id
LEFT JOIN LATERAL (
    SELECT storage_key, alt_text
    FROM public.product_media
    WHERE product_id = p.id
    ORDER BY is_primary DESC, display_order ASC, created_at ASC
    LIMIT 1
) m ON true
WHERE s.customer_id = $1
ORDER BY s.saved_at DESC`

// listRow is the wire shape of listSQL. It never leaves this file.
type listRow struct {
	ProductID        string
	Name             string
	Brand            *string
	PriceAmount      string
	Currency         string
	CompareAtAmount  *string
	StorageKey       *string
	AltText          *string
	SavedAt          time.Time
	SavedPriceAmount string
	CategoryKey      *string
	IsNew            bool
	PriceDropped     bool
	Verdict          string
}

// List returns the shopper's saved items, newest first, each carrying its verdict.
//
// destZoneID is nil when the shopper has no delivery location — a first-class case (FR-038), not an
// error. Every item then reports `not_yet_determined`, because claiming anything else would be
// inventing certainty we do not have.
func (r *Repository) List(ctx context.Context, customerID string, destZoneID *string) ([]listRow, error) {
	rows, err := r.pool.Query(ctx, listSQL, customerID, destZoneID)
	if err != nil {
		return nil, fmt.Errorf("saveditems: list: %w", err)
	}
	defer rows.Close()

	out := make([]listRow, 0, 32)
	for rows.Next() {
		var l listRow
		if err := rows.Scan(
			&l.ProductID, &l.Name, &l.Brand, &l.PriceAmount, &l.Currency, &l.CompareAtAmount,
			&l.StorageKey, &l.AltText, &l.SavedAt, &l.SavedPriceAmount, &l.CategoryKey,
			&l.IsNew, &l.PriceDropped, &l.Verdict,
		); err != nil {
			return nil, fmt.Errorf("saveditems: scan list: %w", err)
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// ── Writes ──────────────────────────────────────────────────────────────────────────────────────

const (
	productExistsSQL = `SELECT EXISTS (SELECT 1 FROM public.product WHERE id = $1)`
	alreadySavedSQL  = `SELECT EXISTS (SELECT 1 FROM public.customer_saved_item WHERE customer_id = $1 AND product_id = $2)`
	countSavedSQL    = `SELECT count(*) FROM public.customer_saved_item WHERE customer_id = $1`

	// ⚠ saved_price_amount is taken from the product IN THE SAME STATEMENT, so the baseline is the
	// price that actually existed at the moment of saving. Reading it separately would leave a window
	// in which the recorded baseline is not the price the shopper saw.
	insertSavedSQL = `
INSERT INTO public.customer_saved_item (customer_id, product_id, saved_price_amount, saved_currency, saved_at)
SELECT $1, p.id, p.price_amount, p.currency, COALESCE($3::timestamptz, now())
FROM public.product p
WHERE p.id = $2
ON CONFLICT (customer_id, product_id) DO NOTHING`

	deleteSavedSQL = `DELETE FROM public.customer_saved_item WHERE customer_id = $1 AND product_id = $2`

	// ⚠ Serialises writes PER CUSTOMER for the duration of the transaction. Without it the cap is not
	// a cap: two concurrent saves at 199 can each count 199 under READ COMMITTED and both commit,
	// landing the shopper at 201. Scoped to one customer, so it never contends across shoppers.
	lockCustomerSQL = `SELECT pg_advisory_xact_lock(hashtext($1))`
)

// Save records a saved item, idempotently.
//
// savedAt is nil for an ordinary save (the row takes now() and lands at the top of the list) and set
// only by undo, which restores the row to the position it previously held (FR-018).
//
// ⚠ The cap is enforced INSIDE the transaction, under an advisory lock — not in the service. A
// service-layer count admits a race between the check and the write, and a cap that can be exceeded
// under load is not a cap.
func (r *Repository) Save(ctx context.Context, customerID, productID string, savedAt *time.Time, cap int) error {
	return r.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, lockCustomerSQL, customerID); err != nil {
			return fmt.Errorf("saveditems: lock: %w", err)
		}

		var exists bool
		if err := tx.QueryRow(ctx, productExistsSQL, productID).Scan(&exists); err != nil {
			return fmt.Errorf("saveditems: product exists: %w", err)
		}
		if !exists {
			return ErrProductNotFound
		}

		// Re-saving something already saved must never trip the cap — it adds nothing.
		var already bool
		if err := tx.QueryRow(ctx, alreadySavedSQL, customerID, productID).Scan(&already); err != nil {
			return fmt.Errorf("saveditems: already saved: %w", err)
		}
		if !already {
			var n int
			if err := tx.QueryRow(ctx, countSavedSQL, customerID).Scan(&n); err != nil {
				return fmt.Errorf("saveditems: count: %w", err)
			}
			if n >= cap {
				return ErrCapReached
			}
		}

		if _, err := tx.Exec(ctx, insertSavedSQL, customerID, productID, savedAt); err != nil {
			return fmt.Errorf("saveditems: insert: %w", err)
		}
		return nil
	})
}

// Remove un-saves a product.
//
// ⚠ Deliberately asymmetric with Save: it does NOT check that the product exists. Removing something
// that is not there is a no-op with the same end state, and answering 404 would make a retried delete
// look like a failure.
func (r *Repository) Remove(ctx context.Context, customerID, productID string) error {
	if _, err := r.pool.Exec(ctx, deleteSavedSQL, customerID, productID); err != nil {
		return fmt.Errorf("saveditems: delete: %w", err)
	}
	return nil
}

// ── Helpers ─────────────────────────────────────────────────────────────────────────────────────

// validUUID keeps a malformed id out of the SQL, so a typo answers 404 rather than a scan error.
func validUUID(s string) bool {
	_, err := uuid.Parse(s)
	return err == nil
}

// ── The guest → account join (FR-028) ───────────────────────────────────────────────────────────

// MergeItem is one device-held saved item being offered to an account.
type MergeItem struct {
	ProductID string
	// ⚠ NIL when the device never observed a price (a guest can save from a surface carrying only an
	// id). The insert then falls back to the product's current price rather than inventing a baseline.
	SavedPriceAmount *string
	SavedCurrency    *string
	SavedAt          time.Time
}

// Skip names one product the merge could not take, and why.
type Skip struct {
	ProductID string
	Reason    string
}

// ⚠ ON CONFLICT DO NOTHING is what makes the join IDEMPOTENT (FR-029). An existing row keeps its
// ORIGINAL saved_at and saved_price_amount: the account's record of when the shopper first cared, and
// at what price, outranks a device's later copy. Overwriting would silently erase the very price
// movement the watchlist exists to report.
//
// ⚠ THE PRICE FALLS BACK TO THE PRODUCT'S CURRENT PRICE WHEN THE DEVICE DID NOT RECORD ONE. A guest
// can save from a surface that knows only the product id, so the baseline is genuinely unknown — and
// the honest answer is "the price as at the moment it joined the account", exactly what an ordinary
// save records. Defaulting to zero instead would report every such item as a massive price drop: a
// fabricated fact, which is worse than an absent one.
const mergeInsertSQL = `
INSERT INTO public.customer_saved_item (customer_id, product_id, saved_price_amount, saved_currency, saved_at)
SELECT $1, p.id, COALESCE($3::numeric, p.price_amount), COALESCE($4, p.currency), $5
FROM public.product p
WHERE p.id = $2
ON CONFLICT (customer_id, product_id) DO NOTHING`

// Merge folds a device-held list into the account, as a set union.
//
// ⚠ Truncates NEWEST-FIRST at the cap and names what did not fit. Nothing already saved is ever
// evicted to make room (FR-047) — the account's existing items outrank an incoming device's.
func (r *Repository) Merge(ctx context.Context, customerID string, items []MergeItem, cap int) (added int, skipped []Skip, ids []string, err error) {
	skipped = []Skip{}

	err = r.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, lockCustomerSQL, customerID); err != nil {
			return fmt.Errorf("saveditems: merge lock: %w", err)
		}

		var n int
		if err := tx.QueryRow(ctx, countSavedSQL, customerID).Scan(&n); err != nil {
			return fmt.Errorf("saveditems: merge count: %w", err)
		}

		for _, it := range items {
			if !validUUID(it.ProductID) {
				skipped = append(skipped, Skip{it.ProductID, "not_found"})
				continue
			}

			var already bool
			if err := tx.QueryRow(ctx, alreadySavedSQL, customerID, it.ProductID).Scan(&already); err != nil {
				return fmt.Errorf("saveditems: merge already: %w", err)
			}
			if already {
				// Present already — the union is satisfied and the account's row stands untouched.
				continue
			}

			var exists bool
			if err := tx.QueryRow(ctx, productExistsSQL, it.ProductID).Scan(&exists); err != nil {
				return fmt.Errorf("saveditems: merge exists: %w", err)
			}
			if !exists {
				// ⚠ Skipped, never fatal. A merge must not fail wholesale because one product was
				// archived away while the guest's list sat on their device.
				skipped = append(skipped, Skip{it.ProductID, "not_found"})
				continue
			}

			if n >= cap {
				skipped = append(skipped, Skip{it.ProductID, "cap_reached"})
				continue
			}

			if _, err := tx.Exec(ctx, mergeInsertSQL,
				customerID, it.ProductID, it.SavedPriceAmount, it.SavedCurrency, it.SavedAt); err != nil {
				return fmt.Errorf("saveditems: merge insert: %w", err)
			}
			n++
			added++
		}

		rows, err := tx.Query(ctx, membershipSQL, customerID)
		if err != nil {
			return fmt.Errorf("saveditems: merge read back: %w", err)
		}
		defer rows.Close()
		ids = make([]string, 0, n)
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return fmt.Errorf("saveditems: merge scan: %w", err)
			}
			ids = append(ids, id)
		}
		return rows.Err()
	})
	if err != nil {
		return 0, nil, nil, err
	}
	return added, skipped, ids, nil
}
