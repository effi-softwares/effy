package saveditems

import (
	"context"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

// Lists (068): business rules. No HTTP, no SQL.

// ListLimit bounds how many lists of their own a shopper may hold; the default list is not counted.
// Mirrors LIST_LIMIT in packages/shared-types. ⚠ Reaching it REFUSES the create; nothing is removed
// to make room.
const ListLimit = 20

// ListNameMax is the longest list name, in Unicode code points, after NormaliseListName. Mirrors
// LIST_NAME_MAX in packages/shared-types and the CHECK on public.customer_list.
const ListNameMax = 40

// reservedListName is what every client calls the default list. A shopper cannot take it for one of
// their own: two lists reading "Saved" would be indistinguishable.
//
// ⚠ This is the service's rule and cannot be the unique index's, because the default row stores no
// name to collide with.
const reservedListName = "Saved"

// NormaliseListName turns what the shopper typed into what is stored: control characters dropped,
// every run of whitespace collapsed to one space, both ends trimmed.
//
// ⚠ Length is counted in CODE POINTS, as Postgres's char_length counts it, so the service and the
// table's CHECK cannot disagree and an emoji is one character to the person who typed it.
//
// ⚠ Uniqueness is NOT decided here. See listNameConstraint.
func NormaliseListName(raw string) (string, error) {
	var b strings.Builder
	space := false
	for _, r := range raw {
		switch {
		case unicode.IsSpace(r):
			space = true
		case unicode.IsControl(r):
			// dropped
		default:
			if space && b.Len() > 0 {
				b.WriteByte(' ')
			}
			space = false
			b.WriteRune(r)
		}
	}
	name := b.String()
	if name == "" || utf8.RuneCountInString(name) > ListNameMax {
		return "", ErrInvalidName
	}
	if strings.EqualFold(name, reservedListName) {
		return "", ErrNameTaken
	}
	return name, nil
}

// List is one of the shopper's lists, as the shopper sees it.
type List struct {
	// A uuid, or DefaultListRef for the default list — no client needs the default's real id.
	ID        string
	IsDefault bool
	// Nil for the default list. "Saved" is each client's string.
	Name  *string
	Count int
	// How many of this list's products are in no other list: what deleting it would un-save.
	OnlyHereCount int
	// Set only when the read named a product.
	ContainsProduct *bool
}

func toList(r listSummaryRow, withProduct bool) List {
	l := List{ID: r.ID, IsDefault: r.IsDefault, Name: r.Name, Count: r.Count, OnlyHereCount: r.OnlyHere}
	if r.IsDefault {
		l.ID = DefaultListRef
	}
	if withProduct {
		c := r.Contains
		l.ContainsProduct = &c
	}
	return l
}

// Lists returns every list the shopper has, the default first. productID is optional; when given,
// each list says whether it holds that product (the chooser's one request).
//
// ⚠ THE DEFAULT LIST IS ALWAYS PRESENT, even for a shopper who has never saved anything and so has
// no row for it. It is supplied here, empty, rather than written on a read.
func (s *Service) Lists(ctx context.Context, customerID string, productID *string) ([]List, error) {
	if productID != nil && !validUUID(*productID) {
		return nil, ErrProductNotFound
	}
	rows, err := s.repo.Lists(ctx, customerID, productID)
	if err != nil {
		return nil, err
	}

	out := make([]List, 0, len(rows)+1)
	if len(rows) == 0 || !rows[0].IsDefault {
		out = append(out, toList(listSummaryRow{IsDefault: true}, productID != nil))
	}
	for _, r := range rows {
		out = append(out, toList(r, productID != nil))
	}
	return out, nil
}

// CreateList creates a named list and, when productID is given, places that product in it in the
// same transaction.
func (s *Service) CreateList(ctx context.Context, customerID, rawName string, productID *string) (List, error) {
	name, err := NormaliseListName(rawName)
	if err != nil {
		return List{}, err
	}
	if productID != nil && !validUUID(*productID) {
		return List{}, ErrProductNotFound
	}
	id, err := s.repo.CreateList(ctx, customerID, name, productID, ListLimit, AccountCap)
	if err != nil {
		return List{}, err
	}
	return s.listByID(ctx, customerID, id)
}

// RenameList renames one of the shopper's own lists.
func (s *Service) RenameList(ctx context.Context, customerID, listRef, rawName string) (List, error) {
	// The default is refused before the name is looked at: "you cannot rename this" outranks
	// "that name is too long".
	if listRef == DefaultListRef {
		return List{}, ErrDefaultList
	}
	name, err := NormaliseListName(rawName)
	if err != nil {
		return List{}, err
	}
	if err := s.repo.RenameList(ctx, customerID, listRef, name); err != nil {
		return List{}, err
	}
	return s.listByID(ctx, customerID, listRef)
}

func (s *Service) listByID(ctx context.Context, customerID, id string) (List, error) {
	rows, err := s.repo.Lists(ctx, customerID, nil)
	if err != nil {
		return List{}, err
	}
	for _, r := range rows {
		if r.ID == id {
			return toList(r, false), nil
		}
	}
	return List{}, ErrListNotFound
}

// DeleteList deletes one of the shopper's own lists. Idempotent.
func (s *Service) DeleteList(ctx context.Context, customerID, listRef string) error {
	return s.repo.DeleteList(ctx, customerID, listRef)
}

// AddEntry places a product in a list. restoreAddedAt is set only by undo.
func (s *Service) AddEntry(ctx context.Context, customerID, listRef, productID string, restoreAddedAt *time.Time) error {
	if !validUUID(productID) {
		return ErrProductNotFound
	}
	return s.repo.AddEntry(ctx, customerID, listRef, productID, restoreAddedAt, AccountCap)
}

// RemoveEntry takes a product out of one list. Idempotent.
func (s *Service) RemoveEntry(ctx context.Context, customerID, listRef, productID string) error {
	if !validUUID(productID) {
		return nil
	}
	return s.repo.RemoveEntry(ctx, customerID, listRef, productID)
}
