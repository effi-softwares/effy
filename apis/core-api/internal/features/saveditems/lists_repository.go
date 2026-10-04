package saveditems

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Lists (068): the shopper's own named lists, and which products are in which.
//
// ⚠ THE INVARIANT THIS FILE KEEPS. A `customer_saved_item` row exists if and only if the product has
// at least one `customer_list_entry`. The entry's foreign key gives "entry ⇒ saved row". The other
// direction is `sweepOrphansSQL`, run in the SAME transaction as anything that removes an entry or a
// list. Every writer here takes the per-customer advisory lock first, so writes for one shopper are
// serial and no committed state has an orphan.

// DefaultListRef addresses the shopper's default list ("Saved") without knowing its id. It is also
// the default list's id on the wire.
const DefaultListRef = "default"

var (
	// ErrListNotFound — no such list for THIS shopper. Deliberately the same answer whether the id
	// is unknown or belongs to someone else.
	ErrListNotFound = errors.New("saveditems: list not found")
	// ErrNameTaken — the shopper already uses this name, compared without regard to letter case.
	ErrNameTaken = errors.New("saveditems: list name taken")
	// ErrInvalidName — empty after normalising, or longer than ListNameMax.
	ErrInvalidName = errors.New("saveditems: invalid list name")
	// ErrListLimit — the shopper is at ListLimit lists of their own. Nothing is removed to make room.
	ErrListLimit = errors.New("saveditems: list limit reached")
	// ErrDefaultList — the default list cannot be renamed or deleted.
	ErrDefaultList = errors.New("saveditems: default list")
	// ErrInNamedLists — the heart's un-save, refused because the product is in a named list.
	ErrInNamedLists = errors.New("saveditems: product is in a named list")
)

const (
	// ⚠ ONE STATEMENT THAT BOTH CREATES AND RETURNS. The no-op DO UPDATE is what lets RETURNING
	// answer on the conflict path too; DO NOTHING returns no row.
	ensureDefaultSQL = `
INSERT INTO public.customer_list (customer_id, is_default)
VALUES ($1, true)
ON CONFLICT (customer_id) WHERE is_default DO UPDATE SET is_default = true
RETURNING id::text`

	defaultListIDSQL = `SELECT id::text FROM public.customer_list WHERE customer_id = $1 AND is_default`
	ownedListSQL     = `SELECT is_default FROM public.customer_list WHERE id = $2 AND customer_id = $1`

	// added_at is writable: undo restores the position the entry held.
	insertEntrySQL = `
INSERT INTO public.customer_list_entry (list_id, product_id, customer_id, added_at)
VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))
ON CONFLICT (list_id, product_id) DO NOTHING`

	deleteEntrySQL = `DELETE FROM public.customer_list_entry WHERE list_id = $1 AND product_id = $2 AND customer_id = $3`

	inNamedListSQL = `
SELECT EXISTS (
    SELECT 1
    FROM public.customer_list_entry e
    JOIN public.customer_list l ON l.id = e.list_id
    WHERE e.customer_id = $1 AND e.product_id = $2 AND NOT l.is_default)`

	// ⚠ THE OTHER HALF OF THE INVARIANT. A product that has just left its last list is no longer
	// saved: its heart empties and its remembered price is forgotten (068 FR-032).
	sweepOrphansSQL = `
DELETE FROM public.customer_saved_item s
WHERE s.customer_id = $1
  AND NOT EXISTS (
      SELECT 1 FROM public.customer_list_entry e
      WHERE e.customer_id = s.customer_id AND e.product_id = s.product_id)`

	namedProductIDsSQL = `
SELECT DISTINCT e.product_id::text
FROM public.customer_list_entry e
JOIN public.customer_list l ON l.id = e.list_id
WHERE e.customer_id = $1 AND NOT l.is_default`

	// ⚠ ONE STATEMENT FOR EVERY LIST, its count, and how much of it lives nowhere else. Bounded by
	// 21 lists and 200 products, so the correlated NOT EXISTS is cheap.
	//
	// $2 is the product the chooser is asking about, or NULL: `e.product_id = NULL` is NULL, bool_or
	// of NULLs is NULL, and COALESCE turns that into false.
	listsSQL = `
SELECT l.id::text,
       l.is_default,
       l.name,
       count(e.product_id)::int AS count,
       (count(e.product_id) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM public.customer_list_entry o
           WHERE o.customer_id = e.customer_id AND o.product_id = e.product_id AND o.list_id <> e.list_id)))::int AS only_here,
       COALESCE(bool_or(e.product_id = $2::uuid), false) AS contains
FROM public.customer_list l
LEFT JOIN public.customer_list_entry e ON e.list_id = l.id
WHERE l.customer_id = $1
GROUP BY l.id
ORDER BY l.is_default DESC, l.created_at ASC, l.id ASC`

	countNamedListsSQL = `SELECT count(*) FROM public.customer_list WHERE customer_id = $1 AND NOT is_default`
	insertListSQL      = `INSERT INTO public.customer_list (customer_id, name) VALUES ($1, $2) RETURNING id::text`
	renameListSQL      = `UPDATE public.customer_list SET name = $3, updated_at = now() WHERE id = $2 AND customer_id = $1 AND NOT is_default`
	deleteListSQL      = `DELETE FROM public.customer_list WHERE id = $2 AND customer_id = $1 AND NOT is_default`
)

// listNameConstraint is the unique index that carries name uniqueness. ⚠ The ONLY mechanism: there
// is no "does this name exist" read before the insert, because a check then a write admits a race
// and a second case-folding rule in Go would eventually disagree with Postgres's lower().
const listNameConstraint = "customer_list_name_uq"

func isNameTaken(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && pg.Code == "23505" && pg.ConstraintName == listNameConstraint
}

// querier is what resolveList needs, so it can run inside or outside a transaction.
type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// resolveList turns a list reference into a list id owned by this customer.
//
// DefaultListRef with no default row yet answers "" and no error: an empty default list. Anything
// else that does not name one of the customer's lists is ErrListNotFound.
func (r *Repository) resolveList(ctx context.Context, q querier, customerID, listRef string) (string, error) {
	if listRef == DefaultListRef {
		var id string
		err := q.QueryRow(ctx, defaultListIDSQL, customerID).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		if err != nil {
			return "", fmt.Errorf("saveditems: default list: %w", err)
		}
		return id, nil
	}
	if !validUUID(listRef) {
		return "", ErrListNotFound
	}
	var isDefault bool
	err := q.QueryRow(ctx, ownedListSQL, customerID, listRef).Scan(&isDefault)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrListNotFound
	}
	if err != nil {
		return "", fmt.Errorf("saveditems: resolve list: %w", err)
	}
	return listRef, nil
}

// listSummaryRow is the wire shape of listsSQL. It never leaves the package's data layer unmapped.
type listSummaryRow struct {
	ID        string
	IsDefault bool
	Name      *string
	Count     int
	OnlyHere  int
	Contains  bool
}

// Lists returns every list the shopper has, the default first. productID may be nil.
//
// ⚠ It never writes. A shopper with no default row yet gets no default row here; the service
// supplies the empty one.
func (r *Repository) Lists(ctx context.Context, customerID string, productID *string) ([]listSummaryRow, error) {
	rows, err := r.pool.Query(ctx, listsSQL, customerID, productID)
	if err != nil {
		return nil, fmt.Errorf("saveditems: lists: %w", err)
	}
	defer rows.Close()

	out := make([]listSummaryRow, 0, 4)
	for rows.Next() {
		var l listSummaryRow
		if err := rows.Scan(&l.ID, &l.IsDefault, &l.Name, &l.Count, &l.OnlyHere, &l.Contains); err != nil {
			return nil, fmt.Errorf("saveditems: scan lists: %w", err)
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// NamedProductIDs returns the saved products held in at least one named list — what the heart
// needs to know before deciding that a tap means "un-save".
func (r *Repository) NamedProductIDs(ctx context.Context, customerID string) ([]string, error) {
	rows, err := r.pool.Query(ctx, namedProductIDsSQL, customerID)
	if err != nil {
		return nil, fmt.Errorf("saveditems: named products: %w", err)
	}
	defer rows.Close()

	ids := make([]string, 0, 16)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("saveditems: scan named products: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// CreateList creates a named list, optionally placing one product in it, and returns its id.
//
// ⚠ ONE TRANSACTION. If the product cannot be placed (it does not exist, the shopper is at the
// saved-products cap) the list is not created either: "new list" from the chooser is one action to
// the shopper and must not half-happen (068 FR-015).
func (r *Repository) CreateList(ctx context.Context, customerID, name string, productID *string, listLimit, cap int) (string, error) {
	var id string
	err := r.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, lockCustomerSQL, customerID); err != nil {
			return fmt.Errorf("saveditems: lock: %w", err)
		}
		var n int
		if err := tx.QueryRow(ctx, countNamedListsSQL, customerID).Scan(&n); err != nil {
			return fmt.Errorf("saveditems: count lists: %w", err)
		}
		if n >= listLimit {
			return ErrListLimit
		}
		if err := tx.QueryRow(ctx, insertListSQL, customerID, name).Scan(&id); err != nil {
			if isNameTaken(err) {
				return ErrNameTaken
			}
			return fmt.Errorf("saveditems: insert list: %w", err)
		}
		if productID != nil {
			return addEntryTx(ctx, tx, customerID, id, *productID, nil, cap)
		}
		return nil
	})
	if err != nil {
		return "", err
	}
	return id, nil
}

// RenameList renames one of the shopper's own lists. Contents and order are untouched.
func (r *Repository) RenameList(ctx context.Context, customerID, listRef, name string) error {
	if listRef == DefaultListRef {
		return ErrDefaultList
	}
	if !validUUID(listRef) {
		return ErrListNotFound
	}
	var isDefault bool
	err := r.pool.QueryRow(ctx, ownedListSQL, customerID, listRef).Scan(&isDefault)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrListNotFound
	}
	if err != nil {
		return fmt.Errorf("saveditems: rename resolve: %w", err)
	}
	if isDefault {
		return ErrDefaultList
	}
	tag, err := r.pool.Exec(ctx, renameListSQL, customerID, listRef, name)
	if err != nil {
		if isNameTaken(err) {
			return ErrNameTaken
		}
		return fmt.Errorf("saveditems: rename: %w", err)
	}
	if tag.RowsAffected() == 0 {
		// Deleted on another device between the read and the write.
		return ErrListNotFound
	}
	return nil
}

// DeleteList deletes one of the shopper's own lists and its entries. Idempotent: a list that is
// already gone is not an error.
//
// ⚠ Products that were ONLY in this list stop being saved (the sweep). Products in any other list
// are untouched — the cascade removes this list's entries and nothing else.
func (r *Repository) DeleteList(ctx context.Context, customerID, listRef string) error {
	if listRef == DefaultListRef {
		return ErrDefaultList
	}
	if !validUUID(listRef) {
		return nil
	}
	return r.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, lockCustomerSQL, customerID); err != nil {
			return fmt.Errorf("saveditems: lock: %w", err)
		}
		var isDefault bool
		err := tx.QueryRow(ctx, ownedListSQL, customerID, listRef).Scan(&isDefault)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("saveditems: delete resolve: %w", err)
		}
		if isDefault {
			return ErrDefaultList
		}
		if _, err := tx.Exec(ctx, deleteListSQL, customerID, listRef); err != nil {
			return fmt.Errorf("saveditems: delete list: %w", err)
		}
		if _, err := tx.Exec(ctx, sweepOrphansSQL, customerID); err != nil {
			return fmt.Errorf("saveditems: sweep: %w", err)
		}
		return nil
	})
}

// AddEntry places a product in a list, saving it first if it is not saved yet. Idempotent.
//
// at is nil for an ordinary add and set only by undo.
//
// ⚠ A list deleted on another device answers ErrListNotFound and the product goes NOWHERE. It is
// never quietly placed in a different list.
func (r *Repository) AddEntry(ctx context.Context, customerID, listRef, productID string, at *time.Time, cap int) error {
	return r.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, lockCustomerSQL, customerID); err != nil {
			return fmt.Errorf("saveditems: lock: %w", err)
		}

		var listID string
		if listRef == DefaultListRef {
			// The one place the default list comes into being, apart from the merge.
			if err := tx.QueryRow(ctx, ensureDefaultSQL, customerID).Scan(&listID); err != nil {
				return fmt.Errorf("saveditems: ensure default list: %w", err)
			}
		} else {
			id, err := r.resolveList(ctx, tx, customerID, listRef)
			if err != nil {
				return err
			}
			listID = id
		}
		return addEntryTx(ctx, tx, customerID, listID, productID, at, cap)
	})
}

// RemoveEntry takes a product out of ONE list. Idempotent, and never refused: the shopper named the
// list, which is exactly what the heart's un-save cannot say.
func (r *Repository) RemoveEntry(ctx context.Context, customerID, listRef, productID string) error {
	return r.inTx(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, lockCustomerSQL, customerID); err != nil {
			return fmt.Errorf("saveditems: lock: %w", err)
		}
		listID, err := r.resolveList(ctx, tx, customerID, listRef)
		if errors.Is(err, ErrListNotFound) {
			// The list is gone, so the product is not in it. Same end state.
			return nil
		}
		if err != nil {
			return err
		}
		if listID == "" {
			return nil // a default list that has never held anything
		}
		if _, err := tx.Exec(ctx, deleteEntrySQL, listID, productID, customerID); err != nil {
			return fmt.Errorf("saveditems: delete entry: %w", err)
		}
		if _, err := tx.Exec(ctx, sweepOrphansSQL, customerID); err != nil {
			return fmt.Errorf("saveditems: sweep: %w", err)
		}
		return nil
	})
}
