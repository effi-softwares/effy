package refunds

import (
	"errors"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

// Handler is the thin edge (Principle VI).
type Handler struct {
	svc   *Service
	staff *auth.StaffGate
}

func NewHandler(svc *Service, staff *auth.StaffGate) *Handler {
	return &Handler{svc: svc, staff: staff}
}

// RegisterAdmin mounts the back-office refund routes behind the BACK-OFFICE pool.
//
// ⚠ THE ONE STRUCTURAL NOVELTY OF 055. `core-api` has verified only the customer pool until now, and
// it is the service that holds the payment secret. This is per-pool validation against the back-office
// pool's own issuer and client ids — the shape Principle IV sanctions — and NOT the auth proxy it
// forbids: the rejected alternative was the cold path forwarding an operator's token here, which is
// brokering by definition (research R1).
//
// ⚠ A customer token is structurally rejected here, and a back-office token is structurally rejected
// on the customer routes. Both directions are proven, because this is new attack surface on the
// service that moves money.
func RegisterAdmin(v1 *gin.RouterGroup, v *auth.PoolVerifier, h *Handler) {
	admin := v1.Group("/admin", auth.Middleware(v))
	admin.POST("/orders/:orderId/refunds", h.issue)
	admin.POST("/orders/:orderId/cancel", h.cancelAsStaff)
	admin.POST("/refund-requests/:requestId/decline", h.declineRequest)
}

// requireWriter is the second gate: a valid back-office token says WHO, `admin.staff` says WHETHER.
//
// ⚠ Principle IV is explicit that where the platform keeps its own record of a person, that record is
// authoritative for the access decision — a valid token from a staff member who has since been
// disabled must be refused, and only the record knows that.
func (h *Handler) requireWriter(c *gin.Context) (string, bool) {
	id, ok := auth.IdentityFromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return "", false
	}
	allowed, err := h.staff.CanWrite(c.Request.Context(), id.Subject)
	if err != nil {
		// ⚠ FAIL-CLOSED, and 503 rather than 403: "we could not check" and "you may not" are
		// different facts, and only one of them should make an operator stop trying.
		logger.FromContext(c.Request.Context()).Error("refunds: staff gate unavailable")
		httpx.Unavailable(c)
		return "", false
	}
	if !allowed {
		// Uniform, and it never says which term failed (FR-021).
		httpx.Forbidden(c)
		return "", false
	}
	return id.Subject, true
}

// issue records and submits a refund (US1).
//
// ⚠ THE ORDER OF OPERATIONS IS THE DESIGN. The refund row is written FIRST, under the ceiling lock,
// and only then is the provider called. The reverse — call the provider, then record — loses money on
// any crash between the two: the customer is refunded and the platform has no record, so the ceiling
// is wrong and it can happen again.
func (h *Handler) issue(c *gin.Context) {
	sub, ok := h.requireWriter(c)
	if !ok {
		return
	}

	var body issueBody
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.ValidationFailed(c, "a valid refund request is required")
		return
	}

	in := IssueInput{
		OrderID:  c.Param("orderId"),
		Kind:     body.Kind,
		Reason:   body.Reason,
		Note:     body.Note,
		Amount:   body.Amount,
		ActorSub: sub,
	}
	for _, l := range body.Lines {
		in.Lines = append(in.Lines, LineInput{OrderItemID: l.OrderItemID, Quantity: l.Quantity})
	}

	out, err := h.svc.Issue(c.Request.Context(), in)
	if err != nil {
		h.respondErr(c, err)
		return
	}
	c.JSON(200, out)
}

type issueBody struct {
	Kind   string `json:"kind"`
	Reason string `json:"reason"`
	Note   string `json:"note"`
	// ⚠ Present in the shape ONLY so an item-derived request that sends one can be REFUSED rather
	// than silently ignored. Ignoring it would let a caller believe they set the amount.
	Amount string `json:"amount"`
	Lines  []struct {
		OrderItemID string `json:"orderItemId"`
		Quantity    int    `json:"quantity"`
	} `json:"lines"`
}

func (h *Handler) respondErr(c *gin.Context, err error) {
	var ceil *ErrCeilingExceeded
	switch {
	case errors.As(err, &ceil):
		// ⚠ The refusal STATES what remains (FR-002) — "too much" alone leaves an operator guessing.
		httpx.ValidationFailed(c, "only "+money.FormatCents(ceil.RemainingCents)+" remains refundable")
	case errors.Is(err, ErrOrderNotFound):
		httpx.NotFound(c)
	case errors.Is(err, ErrAmountRejected):
		httpx.ValidationFailed(c, "an item-derived refund computes its own amount; remove it")
	case errors.Is(err, ErrNoteRequired):
		httpx.ValidationFailed(c, "a goodwill refund must say what it is for")
	case errors.Is(err, ErrInvalidReason), errors.Is(err, ErrNoLines), errors.Is(err, ErrAmountInvalid):
		httpx.ValidationFailed(c, "that refund is not valid")
	case errors.Is(err, ErrLineOverRefunded):
		httpx.ValidationFailed(c, "those units have already been refunded")
	default:
		logger.FromContext(c.Request.Context()).Error("refunds: issue failed", zap.Error(err))
		httpx.Internal(c)
	}
}

// ── Cancellation (US2) ──────────────────────────────────────────────────────────────────────────

// RegisterCustomer mounts the customer's own cancel control behind the CUSTOMER pool.
//
// ⚠ A SEPARATE GROUP FROM `RegisterAdmin`, ON A DIFFERENT VERIFIER, AND THAT IS THE ISOLATION. A
// back-office token is structurally rejected here and a customer token is structurally rejected on the
// admin routes — not by a role check that could be got wrong, but because each group validates against
// its own pool's issuer and client ids (Principle IV). Both directions are tested.
func RegisterCustomer(
	g *gin.RouterGroup,
	h *Handler,
) {
	g.POST("/:id/cancel", h.cancelAsCustomer)
	g.POST("/:id/refund-requests", h.raiseRequest)
}

// cancelAsCustomer cancels an order the caller owns (FR-012).
func (h *Handler) cancelAsCustomer(c *gin.Context) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}
	h.cancel(c, CancelInput{
		OrderID: c.Param("id"), CustomerID: cust.ID,
		ActorKind: "customer", ActorSub: cust.ID,
	})
}

// cancelAsStaff cancels any pre-departure order (FR-018).
//
// ⚠ STAFF HAVE NO "BEFORE PICKING" LIMIT, and the reason is operational rather than technical: a phone
// call arrives after the customer's own control has closed, and someone at Effy has to be able to
// honour it. What staff still cannot do is cancel after collection — the goods have left the shop and
// somebody is carrying them.
func (h *Handler) cancelAsStaff(c *gin.Context) {
	sub, ok := h.requireWriter(c)
	if !ok {
		return
	}
	h.cancel(c, CancelInput{
		OrderID: c.Param("orderId"), ActorKind: "back_office", ActorSub: sub,
	})
}

func (h *Handler) cancel(c *gin.Context, in CancelInput) {
	res, err := h.svc.Cancel(c.Request.Context(), in)
	switch {
	case err == nil:
		c.JSON(200, res)
	case errors.Is(err, ErrAlreadyCancelled):
		// ⚠ 200, NOT 409. A double-tap on a cancel button must not look like a failure, or the shopper
		// taps again — and the order genuinely is cancelled, which is what they asked for.
		c.JSON(200, CancelResult{Status: StatusSucceeded})
	case errors.Is(err, ErrOrderNotFound):
		// ⚠ BYTE-IDENTICAL TO "not yours" (FR-016), because the ownership term is inside the same
		// predicate as the lookup. Two distinguishable refusals here would let anyone enumerate which
		// order ids are real.
		httpx.NotFound(c)
	case errors.Is(err, ErrNotCancellable):
		// ⚠ The wording must not say the order can NEVER be cancelled — staff still can, and a shopper
		// told otherwise will not ring up (FR-012).
		httpx.ValidationFailedAs(c, "not-cancellable",
			"someone has already started preparing this order. Contact us and we'll see what we can do.")
	default:
		h.respondErr(c, err)
	}
}

// ── Refund requests (US3) ───────────────────────────────────────────────────────────────────────

type raiseRequestBody struct {
	Message string `json:"message"`
	// ⚠ OPTIONAL. A shopper who cannot say which line is affected — "the whole thing arrived warm" —
	// must still be able to ask, or they are pushed back to the generic inbox this replaces.
	Items []struct {
		OrderItemID string `json:"orderItemId"`
		Quantity    int    `json:"quantity"`
	} `json:"items"`
}

// raiseRequest records a customer's ask against their own order (FR-005r).
//
// ⚠ IT MOVES NO MONEY AND MUST NOT READ AS A DECISION. The response says the ask was received, never
// that a refund is coming — a form that promised one would be making a commitment a person has not
// made yet, on the screen where a shopper is most likely to hold us to it.
func (h *Handler) raiseRequest(c *gin.Context) {
	cust, ok := customeridentity.FromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}

	var body raiseRequestBody
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.ValidationFailed(c, "say what went wrong")
		return
	}

	items := make([]RequestItem, 0, len(body.Items))
	for _, i := range body.Items {
		items = append(items, RequestItem{OrderItemID: i.OrderItemID, Quantity: i.Quantity})
	}

	id, err := h.svc.RaiseRequest(c.Request.Context(), RaiseRequestInput{
		OrderID: c.Param("id"), CustomerID: cust.ID, Message: body.Message, Items: items,
	})
	switch {
	case err == nil:
		c.JSON(201, gin.H{"requestId": id})
	case errors.Is(err, ErrMessageRequired):
		httpx.ValidationFailed(c, "say what went wrong")
	case errors.Is(err, ErrRequestAlreadyOpen):
		// ⚠ 409 with a sentence a shopper can act on: their ask is already with us. A generic
		// "request failed" would make them raise it again through the generic inbox.
		httpx.Conflict(c, "you've already told us about this order — we're looking into it")
	case errors.Is(err, ErrOrderNotFound):
		// ⚠ BYTE-IDENTICAL to "not yours" — the ownership term is inside the INSERT's own SELECT.
		httpx.NotFound(c)
	default:
		logger.FromContext(c.Request.Context()).Error("refunds: raise request failed", zap.Error(err))
		httpx.Unavailable(c)
	}
}

type declineRequestBody struct {
	Note string `json:"note"`
}

// declineRequest closes a request without money moving (FR-005r2).
//
// ⚠ SAME GATE AS ISSUING A REFUND (admin|manager). Declining looks like the harmless half of the pair
// and is not: telling a customer they are not owed money they believe they are owed is exactly as
// consequential as paying them, and it is the decision nobody comes back to check.
//
// ⚠ AND IT IS NOT EMAILED (T069a). An unsolicited "we said no" invites a reply into something that is
// not a conversation; the order screen is where the shopper is already looking.
func (h *Handler) declineRequest(c *gin.Context) {
	sub, ok := h.requireWriter(c)
	if !ok {
		return
	}
	var body declineRequestBody
	_ = c.ShouldBindJSON(&body)

	err := h.svc.repo.DecideRequest(c.Request.Context(), c.Param("requestId"), "declined", body.Note, sub)
	switch {
	case err == nil:
		c.JSON(200, gin.H{"status": "declined"})
	case errors.Is(err, ErrRequestNotFound):
		// Covers both "no such request" and "already decided" — a second decision must not overwrite
		// the first, and the caller needs no more detail than that this one is settled.
		httpx.NotFound(c)
	default:
		logger.FromContext(c.Request.Context()).Error("refunds: decline failed", zap.Error(err))
		httpx.Unavailable(c)
	}
}
