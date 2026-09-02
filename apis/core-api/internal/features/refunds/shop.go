package refunds

import (
	"context"
	"errors"
	"fmt"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

// 057 US5 — a shop manager refunds their own portion of an order.
//
// ⚠ IT REUSES 055's PIPELINE ENTIRELY. There is no shop-local refund path, no second state machine
// and no duplicated provider call — the spec forbids it (FR-014: "the shop console MUST NOT implement
// a separate or shop-local refund mechanism") and 055's own post-mortem is about what two
// implementations of one rule cost. All this file adds is a differently-authorized way IN, plus the
// one thing a back-office refund does not need: a scope check.
//
// ⚠ WHY THIS LIVES IN core-api AT ALL. The provider secret is here and nowhere else (019 SC-012), so
// the refund machine is here. The alternative — `edge-api/shop` calling this service — would invent an
// inter-service trust boundary the platform does not otherwise have (research R2). 055 already
// established the sanctioned shape by adding a second pool verifier for the identical reason; this is
// the third, and it is mounted on exactly one route.

// ErrLinesNotYours is returned when a requested line is not part of the caller's own shop portion.
//
// ⚠ IT REFUSES THE WHOLE REQUEST RATHER THAN REFUNDING THE SUBSET IT LIKES. Silently dropping the
// lines a shop may not touch is the exact defect 055 caught in itself: "a join that matches nothing
// does not error, it just refunds less than the operator asked for", and the operator is told the
// refund succeeded. A partial refund nobody asked for is worse than a refusal they can read.
var ErrLinesNotYours = errors.New("refunds: one or more lines are not this shop's to refund")

// RegisterShop mounts THE one shop-authorized route on this service.
//
// ⚠ ONE ROUTE, AND THE GROUP EXISTS TO KEEP IT THAT WAY. Every other route on this service is scoped
// to the customer or back-office pool and rejects a shop token structurally — proven in both
// directions in `platform/auth/pool_isolation_test.go`. Adding a second route here should require
// someone to think about it, so the group is deliberately narrow rather than a general `/shop` prefix
// that later routes could be dropped into without review.
func RegisterShop(v1 *gin.RouterGroup, v *auth.PoolVerifier, h *Handler) {
	shop := v1.Group("/shop", auth.Middleware(v))
	shop.POST("/orders/:orderId/refunds", h.issueAsShop)
}

// ShopGate is the record-backed authorization this path requires, narrowed to what the handler uses.
//
// ⚠ AN INTERFACE, NOT THE CONCRETE `auth.ShopGate`, so the handler is testable without a database and
// so this package does not depend on the shape of a platform type it only asks two questions of.
type ShopGate interface {
	CanRefundOrder(ctx context.Context, sub, orderID string) (bool, error)
	ShopIDFor(ctx context.Context, sub string) (string, error)
}

type shopRefundBody struct {
	Lines []struct {
		OrderItemID string `json:"orderItemId"`
		Quantity    int    `json:"quantity"`
	} `json:"lines"`
	Reason string `json:"reason"`
	Note   string `json:"note"`
	// ⚠ Defaults to false, and the default is the honest one (055: stock returns only happen "where
	// the platform can know it should"). A shop refunding an unusable item usually has nothing to put
	// back on the shelf, and inventing stock is worse than not returning it.
	Restock bool `json:"restock"`
}

// issueAsShop is the shop's way into the same refund service back-office uses.
//
// ⚠ THE ORDER OF THE TWO GATES MATTERS. Authorization (may this person refund this order at all) runs
// BEFORE line scoping (are these particular lines theirs), so a caller who is not a manager at a shop
// on this order learns nothing about which lines exist. Reversing them would make the line check an
// oracle for other shops' portions of an order.
func (h *Handler) issueAsShop(c *gin.Context) {
	id, ok := auth.IdentityFromContext(c.Request.Context())
	if !ok {
		httpx.Unauthenticated(c)
		return
	}
	if h.shop == nil {
		// Fail-closed: the route cannot be mounted without its gate, but never assume.
		logger.FromContext(c.Request.Context()).Error("refunds: shop gate not wired")
		httpx.Unavailable(c)
		return
	}

	orderID := c.Param("orderId")

	allowed, err := h.shop.CanRefundOrder(c.Request.Context(), id.Subject, orderID)
	if err != nil {
		// ⚠ 503, not 403 — "we could not check" and "you may not" are different facts, and only one
		// of them should make an operator stop trying.
		logger.FromContext(c.Request.Context()).Error("refunds: shop gate unavailable")
		httpx.Unavailable(c)
		return
	}
	if !allowed {
		// ⚠ Uniform, and it never says WHICH term failed — not a manager, shop suspended, or simply
		// not this shop's order. Saying would turn the route into a probe for which orders exist.
		// The reason IS recorded as a metric, where only Effy can read it.
		h.svc.meter(func(m Metrics) { m.ShopRefundDenied("not_permitted") })
		httpx.Forbidden(c)
		return
	}

	var body shopRefundBody
	if err := c.ShouldBindJSON(&body); err != nil {
		httpx.ValidationFailed(c, "a valid refund request is required")
		return
	}
	if len(body.Lines) == 0 {
		httpx.ValidationFailed(c, "select at least one item to refund")
		return
	}

	shopID, err := h.shop.ShopIDFor(c.Request.Context(), id.Subject)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("refunds: shop lookup unavailable")
		httpx.Unavailable(c)
		return
	}
	if shopID == "" {
		// ⚠ An operator with no shop assigned is an EXPECTED state (007), and it means "refuse" — never
		// "all shops". The difference between those two readings is the difference between a no-op and
		// refunding another shop's order.
		h.svc.meter(func(m Metrics) { m.ShopRefundDenied("no_shop") })
		httpx.Forbidden(c)
		return
	}

	in := IssueInput{
		OrderID: orderID,
		// ⚠ Always `item`. A shop may not issue goodwill: that spends Effy's money on a gesture Effy
		// did not make, and the kind is what staff read later.
		Kind:      "item",
		Reason:    body.Reason,
		Note:      body.Note,
		ActorSub:  id.Subject,
		ActorKind: "shop",
	}
	for _, l := range body.Lines {
		in.Lines = append(in.Lines, LineInput{OrderItemID: l.OrderItemID, Quantity: l.Quantity})
	}

	if err := h.svc.repo.AssertLinesBelongToShop(c.Request.Context(), orderID, shopID, in.Lines); err != nil {
		if errors.Is(err, ErrLinesNotYours) {
			h.svc.meter(func(m Metrics) { m.ShopRefundDenied("not_your_lines") })
			httpx.ValidationFailed(c, "those items are not part of your shop's portion of this order")
			return
		}
		h.respondErr(c, err)
		return
	}

	out, err := h.svc.Issue(c.Request.Context(), in)
	if err != nil {
		h.respondErr(c, err)
		return
	}
	c.JSON(200, out)
}

// AssertLinesBelongToShop refuses unless EVERY named line is part of this shop's portion.
//
// ⚠ IT COUNTS RATHER THAN FILTERS. Returning the matching subset would make a partially-wrong request
// succeed quietly; comparing the count means a request naming one foreign line fails whole.
func (r *Repository) AssertLinesBelongToShop(
	ctx context.Context, orderID, shopID string, lines []LineInput,
) error {
	if len(lines) == 0 {
		return ErrNoLines
	}
	ids := make([]string, 0, len(lines))
	for _, l := range lines {
		ids = append(ids, l.OrderItemID)
	}

	var matched int
	err := r.pool.QueryRow(ctx, `
SELECT COUNT(DISTINCT oi.id)
  FROM public.order_item oi
  JOIN public.shop_fulfillment f
    ON f.order_id = oi.order_id AND f.shop_id = oi.shop_id
 WHERE oi.order_id = $1
   AND oi.shop_id  = $2
   AND oi.id       = ANY($3::uuid[])`, orderID, shopID, ids).Scan(&matched)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrLinesNotYours
		}
		return fmt.Errorf("refunds: shop line scope: %w", err)
	}
	if matched != len(ids) {
		return ErrLinesNotYours
	}
	return nil
}
