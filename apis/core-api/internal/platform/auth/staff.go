package auth

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// StaffGate answers "may this back-office subject act?" from the PLATFORM'S OWN RECORD (055).
//
// ⚠ FROM `admin.staff`, NEVER FROM THE `cognito:groups` CLAIM. Principle IV is explicit: the claim is
// the ORIGIN of a role assignment, and where the platform keeps its own record of that person, the
// record is authoritative for the access decision. A valid token from a staff member who has since
// been disabled must be refused, and only the record knows that.
//
// This is the same two-tier split 046 set for an outward reply and 053 for recording an arrival:
// reading is triage and open to `csa`; writing changes something a customer feels.
type StaffGate struct {
	pool *pgxpool.Pool
}

func NewStaffGate(pool *pgxpool.Pool) *StaffGate { return &StaffGate{pool: pool} }

// WriteRoles are the roles permitted to move money.
//
// ⚠ `csa` IS DELIBERATELY ABSENT. A refund is irreversible — there is no un-refund, and a correction
// is a new charge, which the platform cannot make. That places it with 046's outward reply and 053's
// arrival assertion, not with read-and-triage.
var WriteRoles = []string{"admin", "manager"}

// ⚠ `admin.role` is keyed on `key` (a text primary key), and `staff_role` joins on `role_key` — NOT
// on a surrogate `role_id`. Written from the migration rather than from memory: an earlier draft of
// this file invented `r.id = sr.role_id`, which would have compiled, deployed, and refused every
// staff member at runtime with a message about a column that does not exist.
const staffCanWrite = `
SELECT EXISTS (
    SELECT 1
      FROM admin.staff s
      JOIN admin.staff_role sr ON sr.staff_id = s.id
     WHERE s.cognito_sub = $1
       -- availability-exempt: admin.staff — WHO may act, not what may be sold.
       AND s.status = 'active'
       AND sr.role_key = ANY($2::text[])
)`

// CanWrite reports whether this subject may issue a refund or cancel an order.
//
// ⚠ FAIL-CLOSED. An error is returned, never swallowed into `false`-that-looks-like-a-decision — the
// caller answers 503, because "we could not check" and "you may not" are different facts and only one
// of them should make an operator stop trying.
func (g *StaffGate) CanWrite(ctx context.Context, sub string) (bool, error) {
	var ok bool
	if err := g.pool.QueryRow(ctx, staffCanWrite, sub, WriteRoles).Scan(&ok); err != nil {
		return false, fmt.Errorf("auth: staff write gate: %w", err)
	}
	return ok, nil
}
