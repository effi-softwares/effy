package orders

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
)

type summaryDTO struct {
	ID               string  `json:"id"`
	OrderNumber      string  `json:"orderNumber"`
	Status           string  `json:"status"`
	PlacedAt         *string `json:"placedAt"`
	ItemCount        int     `json:"itemCount"`
	GrandTotalAmount string  `json:"grandTotalAmount"`
	Currency         string  `json:"currency"`
}

type itemDTO struct {
	// ⚠ 055 — THE LINE'S OWN ID, and it was missing until US3 needed it. A customer naming an item in
	// a refund request has to name a LINE, not a product: `order_item` has no uniqueness on
	// (order, product), so two lines of the same product are indistinguishable by product id. Passing
	// one where the other is expected does not error — the join simply matches nothing and every named
	// item is SILENTLY DROPPED.
	//
	// ⚠ It discloses nothing. It is the id of a row on the shopper's own order, carries no shop and no
	// fulfilment structure, and the back-office already speaks this language (FR-005r).
	OrderItemID        string `json:"orderItemId"`
	ProductID          string `json:"productId"`
	ProductName        string `json:"productName"`
	UnitPriceAmount    string `json:"unitPriceAmount"`
	Quantity           int    `json:"quantity"`
	LineSubtotalAmount string `json:"lineSubtotalAmount"`
	// 052 — decoration only. `omitempty` keeps the key off the wire entirely when there is no image,
	// so a client cannot mistake an empty string for a url.
	ImageURL *string `json:"imageUrl,omitempty"`
}

// 052 — how the order was paid (FR-006).
//
// ⚠ THE ONLY CARD FIELD HERE IS `last4`, and no other may be added. This struct is the boundary 051's
// payment.ts describes: a card number, an expiry or a cardholder name must never be representable.
type paymentMethodDTO struct {
	Type  string  `json:"type"`
	Brand *string `json:"brand"`
	Last4 *string `json:"last4"`
}

// 052 — one package's expected arrival (FR-007).
//
// ⚠ NO SHOP REFERENCE, and DATES not times. The underlying columns are `date`; the platform has no
// delivery time window and must not appear to promise one (research R4).
type arrivalEstimateDTO struct {
	Method       string  `json:"method"`
	PromisedFrom *string `json:"promisedFrom"`
	PromisedTo   *string `json:"promisedTo"`
}

// A shortfall the customer is being told about — product name and quantity only, NO shop (FR-018c).
type shortfallDTO struct {
	ProductName string `json:"productName"`
	Quantity    int    `json:"quantity"`
}

type fulfillmentDTO struct {
	Status         string `json:"status"`
	ItemCount      int    `json:"itemCount"`
	SubtotalAmount string `json:"subtotalAmount"`
	// Omitted entirely while the portion is still being picked (FR-018b, SC-017), so a flag that is
	// later undone never reaches the customer. `omitempty` is load-bearing, not cosmetic.
	Unavailable []shortfallDTO `json:"unavailableItems,omitempty"`
}

type orderDTO struct {
	ID                 string           `json:"id"`
	OrderNumber        string           `json:"orderNumber"`
	Status             string           `json:"status"`
	PlacedAt           *string          `json:"placedAt"`
	Items              []itemDTO        `json:"items"`
	DeliveryAddress    json.RawMessage  `json:"deliveryAddress"`
	BillingAddress     json.RawMessage  `json:"billingAddress,omitempty"`
	ItemSubtotalAmount string           `json:"itemSubtotalAmount"`
	DiscountAmount     string           `json:"discountAmount"`
	DeliveryFeeAmount  string           `json:"deliveryFeeAmount"`
	PromoCode          *string          `json:"promoCode"`
	GrandTotalAmount   string           `json:"grandTotalAmount"`
	Currency           string           `json:"currency"`
	PaymentStatus      string           `json:"paymentStatus"`
	Fulfillments       []fulfillmentDTO `json:"fulfillments"`

	// 052 — the customer-facing progress word. SERVER-DERIVED; no client computes it (FR-008).
	Stage string `json:"stage"`
	// 055 — whether the shopper may cancel this themselves. ⚠ SERVER-DERIVED; the client renders the
	// control from this and never computes it (FR-012).
	Cancellable bool `json:"cancellable"`

	// ── 055 US5 — what happened to this shopper's money (FR-023) ────────────────────────────────
	//
	// ⚠ ALL FOUR ARE `omitempty`, AND THAT IS SC-011. An order with no refunds must serialise
	// BYTE-IDENTICALLY to its pre-055 self: no empty array, no "0.00" totals, no `fullyRefunded:false`.
	// A client that has never seen a refund must not be able to tell this slice shipped.
	Refunds []customerRefundDTO `json:"refunds,omitempty"`
	// The sum of every refund that has actually left or is on its way.
	RefundedTotal string `json:"refundedTotal,omitempty"`
	// What the shopper is out of pocket after refunds. ⚠ NOT a correction to `grandTotalAmount`,
	// which stays what was CHARGED (FR-024) — a receipt that rewrote itself could not be reconciled
	// against a bank statement.
	AmountPaidAfterRefunds string `json:"amountPaidAfterRefunds,omitempty"`
	// ⚠ Derived from the totals, never stored, so reaching it line by line and in one act agree.
	FullyRefunded bool `json:"fullyRefunded,omitempty"`
	// 052 — nil on a pre-052 order or a failed capture. The client omits the line rather than blanking.
	PaymentMethod *paymentMethodDTO `json:"paymentMethod"`
	// 052 — one entry per package. Always present (possibly empty) so a client has no undefined branch.
	ArrivalEstimates []arrivalEstimateDTO `json:"arrivalEstimates"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) list(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	list, err := h.svc.List(c.Request.Context(), cust.ID)
	if err != nil {
		logger.FromContext(c.Request.Context()).Error("orders: list failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	out := make([]summaryDTO, 0, len(list))
	for _, o := range list {
		out = append(out, summaryDTO{
			ID: o.ID, OrderNumber: o.OrderNumber, Status: o.Status, PlacedAt: o.PlacedAt,
			ItemCount: o.ItemCount, GrandTotalAmount: o.GrandTotalAmount, Currency: o.Currency,
		})
	}
	c.JSON(http.StatusOK, out)
}

func (h *Handler) get(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	order, err := h.svc.Get(c.Request.Context(), cust.ID, c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			httpx.NotFound(c)
			return
		}
		logger.FromContext(c.Request.Context()).Error("orders: get failed", zap.Error(err))
		httpx.Internal(c)
		return
	}

	items := make([]itemDTO, 0, len(order.Items))
	for _, it := range order.Items {
		items = append(items, itemDTO{
			OrderItemID: it.OrderItemID,
			ProductID:   it.ProductID, ProductName: it.ProductName, UnitPriceAmount: it.UnitPriceAmount,
			Quantity: it.Quantity, LineSubtotalAmount: it.LineSubtotalAmount,
			ImageURL: it.ImageURL,
		})
	}
	ful := make([]fulfillmentDTO, 0, len(order.Fulfillments))
	for _, f := range order.Fulfillments {
		var short []shortfallDTO
		for _, sh := range f.Unavailable {
			short = append(short, shortfallDTO{ProductName: sh.ProductName, Quantity: sh.Quantity})
		}
		ful = append(ful, fulfillmentDTO{
			Status: f.Status, ItemCount: f.ItemCount, SubtotalAmount: f.SubtotalAmount,
			Unavailable: short,
		})
	}
	address := order.DeliveryAddress
	if len(address) == 0 {
		address = json.RawMessage("{}")
	}
	// Billing: nil/empty stays omitted (JSON `billingAddress` absent) → the client renders "same as
	// shipping" (FR-016). A value is the divergent billing snapshot. Never defaulted to {}.
	var billing json.RawMessage
	if len(order.BillingAddress) > 0 {
		billing = order.BillingAddress
	}

	// 052 — the arrival estimates. Always an array, never null: a client with no undefined branch is
	// one fewer place a receipt can render half-formed.
	arrivals := make([]arrivalEstimateDTO, 0, len(order.ArrivalEstimates))
	for _, a := range order.ArrivalEstimates {
		arrivals = append(arrivals, arrivalEstimateDTO{
			Method: a.Method, PromisedFrom: a.PromisedFrom, PromisedTo: a.PromisedTo,
		})
	}
	var method *paymentMethodDTO
	if order.PaymentMethod != nil {
		method = &paymentMethodDTO{
			Type: order.PaymentMethod.Type, Brand: order.PaymentMethod.Brand, Last4: order.PaymentMethod.Last4,
		}
	}

	c.JSON(http.StatusOK, orderDTO{
		ID: order.ID, OrderNumber: order.OrderNumber, Status: order.Status, PlacedAt: order.PlacedAt,
		Items: items, DeliveryAddress: address, BillingAddress: billing,
		ItemSubtotalAmount: order.ItemSubtotalAmount, DiscountAmount: order.DiscountAmount, PromoCode: order.PromoCode,
		DeliveryFeeAmount: order.DeliveryFeeAmount,
		GrandTotalAmount:  order.GrandTotalAmount, Currency: order.Currency,
		PaymentStatus: order.PaymentStatus, Fulfillments: ful,
		Stage:                  string(order.Stage),
		Cancellable:            order.Cancellable,
		Refunds:                refundDTOs(order.Refunds),
		RefundedTotal:          refundedOrEmpty(order),
		AmountPaidAfterRefunds: paidAfterOrEmpty(order),
		FullyRefunded:          order.FullyRefunded,
		PaymentMethod:          method, ArrivalEstimates: arrivals,
	})
}

// Register mounts the order history + receipt reads on a customer-scoped group.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/orders", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.GET("", h.list)
	g.GET("/:id", h.get)
}

// ── 055 US5 ─────────────────────────────────────────────────────────────────────────────────────

// customerRefundDTO is one refund, as the SHOPPER sees it.
//
// ⚠ THERE IS NO `failureReason` FIELD AND THERE MUST NOT BE. "Your bank rejected the refund" is
// staff information: a shopper cannot act on it, and surfacing it invites them to argue with a
// message that will not change (FR-026). The repository does not even select the column, so no
// mapper can leak it by accident.
//
// ⚠ AND NO `kind` OR `reason`. Whether a refund was item-derived, goodwill or a cancellation is
// Effy's own vocabulary; what a shopper needs is the amount, whether it has landed, and when.
type customerRefundDTO struct {
	Amount string `json:"amount"`
	// on_its_way | completed | there_was_a_problem — five internal states collapsed to three.
	State string `json:"state"`
	// When the money actually landed. Null until it has — never a promise of when it will.
	RefundedAt *string `json:"refundedAt"`
}

func refundDTOs(in []CustomerRefund) []customerRefundDTO {
	if len(in) == 0 {
		// ⚠ nil, not an empty slice — `omitempty` then drops the key entirely (SC-011).
		return nil
	}
	out := make([]customerRefundDTO, 0, len(in))
	for _, r := range in {
		out = append(out, customerRefundDTO{Amount: r.Amount, State: r.State, RefundedAt: r.RefundedAt})
	}
	return out
}

// ⚠ EMPTY WHEN THERE ARE NO REFUNDS, so `omitempty` drops the key. Sending "0.00" would add three
// fields to every order response on the platform to say nothing happened.
func refundedOrEmpty(o Order) string {
	if len(o.Refunds) == 0 {
		return ""
	}
	return o.RefundedTotal
}

func paidAfterOrEmpty(o Order) string {
	if len(o.Refunds) == 0 {
		return ""
	}
	return o.AmountPaidAfterRefunds
}
