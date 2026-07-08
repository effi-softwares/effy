// Package adminbootstrap establishes the first back-office super-administrator out-of-band
// (spec 006). It performs the two writes the platform's access control depends on — the identity
// provider (so the person can authenticate) and the platform staff/role record (so they are
// authorized) — keeping them consistent by Cognito-first ordering + idempotent reconciliation.
package adminbootstrap

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"
)

// RoleAdmin is the back-office super-admin role/group (005 schema; full administrative access).
const RoleAdmin = "admin"

// Input is the operator-supplied initial data.
type Input struct {
	Email string
	Name  string
}

// Validate enforces well-formed email + required name BEFORE any side effect (FR-005).
func (in Input) Validate() error {
	if strings.TrimSpace(in.Name) == "" {
		return errors.New("name is required")
	}
	if _, err := mail.ParseAddress(in.Email); err != nil {
		return fmt.Errorf("invalid email %q: %w", in.Email, err)
	}
	return nil
}

// Result is the structured outcome (printed + logged; no secrets — FR-008/009).
type Result struct {
	Email   string `json:"email"`
	Subject string `json:"sub"`
	Cognito string `json:"cognito"` // "created" | "already-exists"
	Group   string `json:"group"`   // "admin"
	Staff   string `json:"staff"`   // "created" | "updated"
	Role    string `json:"role"`    // "admin"
}

// IdentityProvider ensures the admin exists in the identity provider and returns the stable sub.
type IdentityProvider interface {
	EnsureAdmin(ctx context.Context, email, name string) (sub string, outcome string, err error)
}

// Repository ensures the platform staff/role record, keyed on the sub.
type Repository interface {
	UpsertSuperAdmin(ctx context.Context, sub, email, name string) (outcome string, err error)
}

// Run: Cognito FIRST (to obtain the stable sub — the 005 DB join key), then the DB record keyed on
// that sub. No cross-system transaction exists; a partial failure is recoverable by re-running
// (both writes are idempotent). See plan.md "two systems, kept consistent".
func Run(ctx context.Context, idp IdentityProvider, repo Repository, in Input) (Result, error) {
	sub, cognitoOutcome, err := idp.EnsureAdmin(ctx, in.Email, in.Name)
	if err != nil {
		return Result{}, fmt.Errorf("cognito: %w", err)
	}
	staffOutcome, err := repo.UpsertSuperAdmin(ctx, sub, in.Email, in.Name)
	if err != nil {
		return Result{}, fmt.Errorf("db: %w", err)
	}
	return Result{
		Email:   in.Email,
		Subject: sub,
		Cognito: cognitoOutcome,
		Group:   RoleAdmin,
		Staff:   staffOutcome,
		Role:    RoleAdmin,
	}, nil
}

// --- Account teardown (delete) — spec US4 / FR-011–016 ---

// ErrLastAdmin is returned when a delete would remove the last active administrator (guard FR-014).
var ErrLastAdmin = errors.New("refusing to delete the last active administrator (pass --force to override)")

// DeleteResult is the structured teardown outcome (printed + logged; no secrets — FR-016).
type DeleteResult struct {
	Email   string `json:"email"`
	Subject string `json:"sub"`
	Cognito string `json:"cognito"` // "deleted" | "not-found"
	Staff   string `json:"staff"`   // "deleted" | "not-found"
}

// IdentityDeleter resolves + hard-deletes an account in the identity provider.
type IdentityDeleter interface {
	ResolveAdmin(ctx context.Context, email string) (sub, username string, found bool, err error)
	DeleteAdmin(ctx context.Context, username string) (deleted bool, err error)
}

// RecordDeleter guards the last admin and removes the platform staff record.
type RecordDeleter interface {
	IsLastActiveAdmin(ctx context.Context, sub string) (bool, error)
	DeleteAdmin(ctx context.Context, sub, email string) (outcome string, err error)
}

// Delete completely removes an admin from BOTH systems, kept consistent by identity-first ordering
// + idempotent reconciliation (plan Amendment D). It refuses to delete the last active admin unless
// force is set (FR-014). Safe to re-run: missing accounts report "not-found", never error.
func Delete(ctx context.Context, idp IdentityDeleter, repo RecordDeleter, email string, force bool) (DeleteResult, error) {
	if _, err := mail.ParseAddress(email); err != nil {
		return DeleteResult{}, fmt.Errorf("invalid email %q: %w", email, err)
	}

	sub, username, found, err := idp.ResolveAdmin(ctx, email)
	if err != nil {
		return DeleteResult{}, fmt.Errorf("cognito resolve: %w", err)
	}

	cognitoOutcome := "not-found"
	if found {
		if !force && sub != "" {
			last, lerr := repo.IsLastActiveAdmin(ctx, sub)
			if lerr != nil {
				return DeleteResult{}, fmt.Errorf("last-admin check: %w", lerr)
			}
			if last {
				return DeleteResult{}, ErrLastAdmin
			}
		}
		deleted, derr := idp.DeleteAdmin(ctx, username)
		if derr != nil {
			return DeleteResult{}, fmt.Errorf("cognito delete: %w", derr)
		}
		if deleted {
			cognitoOutcome = "deleted"
		}
	}

	staffOutcome, err := repo.DeleteAdmin(ctx, sub, email)
	if err != nil {
		return DeleteResult{}, fmt.Errorf("db delete: %w", err)
	}

	return DeleteResult{Email: email, Subject: sub, Cognito: cognitoOutcome, Staff: staffOutcome}, nil
}
