package checkout

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"github.com/effyshopping/effy/apis/core-api/internal/platform/auth"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/customeridentity"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/delivery"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/deliveryinstructions"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/httpx"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/logger"
	"github.com/effyshopping/effy/apis/core-api/internal/platform/money"
)

const maxWebhookBody = 1 << 20 // 1 MiB — Stripe events are small; cap the raw read.

type createIntentRequest struct {
	AddressID        string `json:"addressId"`
	BillingAddressID string `json:"billingAddressId"`
	// 047: the order-level delivery preference ("same_day" or "standard", default standard). Applied per
	// package where offered; the server prices it and never takes a fee from the client (FR-036/044).
	DeliveryMethod string `json:"deliveryMethod"`
	// 069: the same-day slot and the standard day the customer chose. Neither is ever substituted — an
	// intent whose slot or day is no longer on offer is refused (409 + a fresh quote) and they re-choose.
	SameDaySlotID string `json:"sameDaySlotId"`
	StandardDate  string `json:"standardDate"`
	// 066: what the customer tells the driver for this order. Kept RAW so the one rule in
	// platform/deliveryinstructions decides what is valid — including "the note is not text" — and the
	// binding layer cannot silently coerce or drop it.
	DeliveryInstructions json.RawMessage `json:"deliveryInstructions"`
	// 051: set by a client that renders a PROVIDER-OWNED payment-method list (the mobile embedded
	// element) and needs a customer session to do it. Web renders Effy's own list and leaves this false.
	//
	// ⚠ Asking for a session is not authorization to get someone else's: the session is always minted for
	// the AUTHENTICATED subject, so the worst a hostile client achieves is a session for itself.
	//
	// ⚠ There is deliberately NO `billingDetails` field on this request. The billing details are derived
	// from the order's own snapshot; accepting one here would let a client contradict the address it
	// confirmed one screen earlier (contract § 1, FR-016).
	WantsProviderMethodList bool `json:"wantsProviderMethodList"`
}

type createIntentResponse struct {
	OrderID          string `json:"orderId"`
	OrderNumber      string `json:"orderNumber"`
	ClientSecret     string `json:"clientSecret"`
	PublishableKey   string `json:"publishableKey"`
	GrandTotalAmount string `json:"grandTotalAmount"`
	Currency         string `json:"currency"`
	// 051 — additive. `omitempty` on the session keeps the web response byte-identical to before.
	//
	// ⚠ The provider CUSTOMER id is absent by design and must stay absent: no surface has any use for it
	// (data-model § 1).
	CustomerSessionSecret string              `json:"customerSessionSecret,omitempty"`
	CustomerID            string              `json:"customerId,omitempty"`
	PayOverTimeAvailable  bool                `json:"payOverTimeAvailable"`
	BillingDetails        *billingDetailsBody `json:"billingDetails,omitempty"`
	// 069 — when the held same-day place lapses. Omitted when no package is same-day, which keeps the
	// response for a standard order byte-identical to before.
	SlotHeldUntil string `json:"slotHeldUntil,omitempty"`
}

// billingDetailsBody is what the client passes back at confirmation, because the payment step no longer
// asks the shopper for a country, a postcode or a name (051 FR-014/FR-015).
type billingDetailsBody struct {
	Name    string             `json:"name"`
	Email   string             `json:"email"`
	Address billingAddressBody `json:"address"`
}

type billingAddressBody struct {
	Line1      string `json:"line1"`
	Line2      string `json:"line2"`
	City       string `json:"city"`
	State      string `json:"state"`
	PostalCode string `json:"postalCode"`
	Country    string `json:"country"`
}

// paymentMethodBody is one kept card. ⚠ These are the ONLY fields permitted to leave the provider:
// no card number, no security code, no cardholder name (FR-025 / SC-012).
type paymentMethodBody struct {
	ID             string `json:"id"`
	Brand          string `json:"brand"`
	Last4          string `json:"last4"`
	ExpMonth       int64  `json:"expMonth"`
	ExpYear        int64  `json:"expYear"`
	IsDefault      bool   `json:"isDefault"`
	Usable         bool   `json:"usable"`
	UnusableReason string `json:"unusableReason,omitempty"`
}

type listPaymentMethodsResponse struct {
	PaymentMethods []paymentMethodBody `json:"paymentMethods"`
}

type quoteRequest struct {
	AddressID string `json:"addressId"`
}

// Delivery quote DTOs (047) — mirror @effy/shared-types DeliveryQuoteDTO. Money is a 2-dp decimal string.
type quoteOptionDTO struct {
	Method       string  `json:"method"`
	FeeAmount    string  `json:"feeAmount"`
	PromisedFrom *string `json:"promisedFrom"`
	PromisedTo   *string `json:"promisedTo"`
}

type quotePackageDTO struct {
	ShopRef string           `json:"shopRef"`
	Options []quoteOptionDTO `json:"options"`
}

type deliveryQuoteDTO struct {
	Postcode              string            `json:"postcode"`
	Serviced              bool              `json:"serviced"`
	SameDayAvailableUntil *string           `json:"sameDayAvailableUntil"`
	Packages              []quotePackageDTO `json:"packages"`
	ExpiresAt             string            `json:"expiresAt"`
	// 069. ⚠ Arrays, never null: a client iterates them without a guard.
	SameDaySlots             []slotOptionDTO  `json:"sameDaySlots"`
	SameDayUnavailableReason *string          `json:"sameDayUnavailableReason"`
	StandardDays             []standardDayDTO `json:"standardDays"`
}

// slotOptionDTO mirrors @effy/shared-types DeliverySlotOptionDTO. ⚠ No capacity, no remaining count, no
// fee: how full a slot is stays Effy's business, and the fee is the method's (FR-021, FR-050).
type slotOptionDTO struct {
	SlotID   string `json:"slotId"`
	Date     string `json:"date"`
	StartAt  string `json:"startAt"`
	EndAt    string `json:"endAt"`
	CutoffAt string `json:"cutoffAt"`
}

type standardDayDTO struct {
	Date string `json:"date"`
}

// deliveryChoiceRefusal is the 409 body when the chosen slot or day cannot be honoured (069). It is an
// RFC 9457 problem with two extension members: the `code` the client switches on, and the options as
// they stand NOW so it can re-offer without a second request.
type deliveryChoiceRefusal struct {
	httpx.Problem
	Code  string            `json:"code"`
	Quote *deliveryQuoteDTO `json:"quote,omitempty"`
}

type confirmRequest struct {
	OrderID string `json:"orderId"`
}

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) createIntent(c *gin.Context) {
	var req createIntentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "addressId is required")
		return
	}
	// 066 — refused BEFORE anything is written. ⚠ The refusal names the field and the rule and never
	// the value: a note can hold a gate code, and a validation error is exactly what gets logged.
	instructions, ierr := deliveryinstructions.ParseJSON(req.DeliveryInstructions)
	if ierr != nil {
		field, reason := deliveryinstructions.FieldAndReason(ierr)
		httpx.ValidationFailed(c, "check your delivery instructions",
			httpx.FieldError{Field: "deliveryInstructions." + field, Message: reason})
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	res, err := h.svc.CreateCheckoutIntent(c.Request.Context(), cust.ID,
		IntentInput{
			AddressID:               req.AddressID,
			BillingAddressID:        req.BillingAddressID,
			DeliveryMethod:          req.DeliveryMethod,
			SameDaySlotID:           req.SameDaySlotID,
			StandardDate:            req.StandardDate,
			DeliveryInstructions:    instructions,
			WantsProviderMethodList: req.WantsProviderMethodList,
		}, time.Now())
	if err != nil {
		var choice *DeliveryChoiceError
		switch {
		case errors.As(err, &choice):
			h.refuseDeliveryChoice(c, cust.ID, req.AddressID, choice)
		case errors.Is(err, ErrEmptyCart):
			httpx.ValidationFailed(c, "your cart has no items available to purchase")
		case errors.Is(err, ErrAddressNotFound):
			httpx.ValidationFailed(c, "choose a valid delivery address")
		case errors.Is(err, ErrNotServiceable):
			// 047 FR-002: the single "we don't deliver there yet" outcome.
			httpx.ValidationFailed(c, "we don't deliver to this address yet")
		case belowMinimum(err) != nil:
			// FR-056: refused here as well as in the cart, so a client that ignores its own gate cannot
			// bypass it. The message carries how much more is needed — never a shop (FR-062).
			e := belowMinimum(err)
			httpx.ValidationFailed(c, fmt.Sprintf(
				"add %s more to reach the %s minimum order",
				money.FormatCents(e.RemainingCents), money.FormatCents(e.MinimumCents),
			))
		default:
			logger.FromContext(c.Request.Context()).Error("checkout: intent failed", zap.Error(err))
			httpx.Internal(c)
		}
		return
	}
	c.JSON(http.StatusOK, createIntentResponse{
		OrderID: res.OrderID, OrderNumber: res.OrderNumber, ClientSecret: res.ClientSecret,
		PublishableKey: res.PublishableKey, GrandTotalAmount: res.GrandTotal, Currency: res.Currency,
		CustomerSessionSecret: res.CustomerSessionSecret,
		CustomerID:            res.ProviderCustomerID,
		PayOverTimeAvailable:  res.PayOverTimeAvailable,
		SlotHeldUntil:         melbourneStamp(res.SlotHeldUntil),
		BillingDetails: &billingDetailsBody{
			Name:  res.BillingDetails.Name,
			Email: res.BillingDetails.Email,
			Address: billingAddressBody{
				Line1:      res.BillingDetails.Address.Line1,
				Line2:      res.BillingDetails.Address.Line2,
				City:       res.BillingDetails.Address.City,
				State:      res.BillingDetails.Address.State,
				PostalCode: res.BillingDetails.Address.PostalCode,
				Country:    res.BillingDetails.Address.Country,
			},
		},
	})
}

// listPaymentMethods returns the shopper's kept cards (051 US3/US6).
func (h *Handler) listPaymentMethods(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	cards, err := h.svc.ListKeptCards(c.Request.Context(), cust.ID, time.Now())
	if err != nil {
		// ⚠ A provider failure is a 500, NEVER an empty list. "You have no cards" and "we could not ask"
		// are different facts, and a client cannot tell them apart from a 200 with `[]` (FR-036).
		logger.FromContext(c.Request.Context()).Error("checkout: list payment methods failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	body := make([]paymentMethodBody, 0, len(cards))
	for _, k := range cards {
		body = append(body, paymentMethodBody{
			ID: k.ID, Brand: k.Brand, Last4: k.Last4,
			ExpMonth: k.ExpMonth, ExpYear: k.ExpYear, IsDefault: k.IsDefault,
			Usable: k.Usable, UnusableReason: k.UnusableReason,
		})
	}
	c.JSON(http.StatusOK, listPaymentMethodsResponse{PaymentMethods: body})
}

// removePaymentMethod detaches a kept card (051 FR-024).
func (h *Handler) removePaymentMethod(c *gin.Context) {
	cust, _ := customeridentity.FromContext(c.Request.Context())
	err := h.svc.RemoveKeptCard(c.Request.Context(), cust.ID, c.Param("id"))
	switch {
	case err == nil:
		c.Status(http.StatusNoContent)
	case errors.Is(err, ErrPaymentMethodNotFound):
		// ⚠ 404 for both "no such card" and "not yours" — see ErrPaymentMethodNotFound. Removal is also
		// idempotent from the shopper's point of view: removing a card twice is not an error worth
		// showing them.
		httpx.NotFound(c)
	default:
		logger.FromContext(c.Request.Context()).Error("checkout: detach payment method failed", zap.Error(err))
		httpx.Internal(c)
	}
}

func (h *Handler) confirm(c *gin.Context) {
	var req confirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "orderId is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	res, err := h.svc.Confirm(c.Request.Context(), cust.ID, req.OrderID)
	if err != nil {
		if errors.Is(err, ErrOrderNotFound) {
			httpx.NotFound(c)
			return
		}
		logger.FromContext(c.Request.Context()).Error("checkout: confirm failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"orderId": res.OrderID, "paid": res.Paid})
}

// webhook is the authoritative finalizer. Raw body + signature verification — NO pool authorizer (the
// sanctioned webhook exception, ARCHITECTURE.md). A bad signature is 400; a processed event is 200.
func (h *Handler) webhook(c *gin.Context) {
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maxWebhookBody))
	if err != nil {
		httpx.ValidationFailed(c, "could not read request body")
		return
	}
	signature := c.GetHeader("Stripe-Signature")
	if err := h.svc.HandleWebhook(c.Request.Context(), body, signature); err != nil {
		// A signature/verification failure must not be retried by Stripe as a 5xx; it is a 400.
		logger.FromContext(c.Request.Context()).Warn("checkout: webhook rejected", zap.String("reason", err.Error()))
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	c.Status(http.StatusOK)
}

// quote previews delivery for the cart to a chosen address (047 US1): the GST-inclusive standard fee per
// package and the order total, shown BEFORE payment so the fee is never a surprise (no drip). Reinstated
// after delivery was withdrawn — for US1 there is one option (standard); same-day joins it in US2.
func (h *Handler) quote(c *gin.Context) {
	var req quoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationFailed(c, "addressId is required")
		return
	}
	cust, _ := customeridentity.FromContext(c.Request.Context())
	q, err := h.svc.QuoteForCheckout(c.Request.Context(), cust.ID, req.AddressID, time.Now())
	if err != nil {
		if errors.Is(err, ErrAddressNotFound) {
			httpx.ValidationFailed(c, "choose a valid delivery address")
			return
		}
		logger.FromContext(c.Request.Context()).Error("checkout: quote failed", zap.Error(err))
		httpx.Internal(c)
		return
	}
	out := toQuoteDTO(q)
	c.JSON(http.StatusOK, out)
}

// refuseDeliveryChoice answers a checkout whose slot or day cannot be honoured (069): 409, the code, and
// a FRESH quote so the client re-offers what is actually available.
//
// ⚠ The fresh quote is best-effort. If it cannot be computed the refusal still goes out without it —
// the customer must be told their choice was refused whether or not we can also say what is left.
func (h *Handler) refuseDeliveryChoice(c *gin.Context, customerID, addressID string, choice *DeliveryChoiceError) {
	detail := map[string]string{
		ChoiceSlotRequired:    "choose a delivery time",
		ChoiceSlotUnavailable: "that delivery time is no longer available — choose another",
		ChoiceDateUnavailable: "that delivery day is no longer available — choose another",
	}[choice.Code]

	body := deliveryChoiceRefusal{
		Problem: httpx.Problem{
			Type: httpx.TypeConflict, Title: "Conflict", Status: http.StatusConflict, Detail: detail,
			Instance: c.Request.URL.Path, RequestID: httpx.RequestID(c),
		},
		Code: choice.Code,
	}
	if q, err := h.svc.QuoteForCheckout(c.Request.Context(), customerID, addressID, time.Now()); err == nil {
		dto := toQuoteDTO(q)
		body.Quote = &dto
	} else {
		logger.FromContext(c.Request.Context()).Warn("checkout: fresh quote for refusal failed", zap.Error(err))
	}
	c.Header("Content-Type", "application/problem+json")
	c.AbortWithStatusJSON(http.StatusConflict, body)
}

// melbourneStamp renders an instant with the Australia/Melbourne offset, or "" for nil. Every delivery
// time on the wire is a Melbourne time, wherever the customer's device is (FR-029).
func melbourneStamp(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.In(delivery.MelbourneTZ).Format(time.RFC3339)
}

// toQuoteDTO maps the service quote to its wire shape — shared by the quote route and the refusal.
func toQuoteDTO(q DeliveryQuote) deliveryQuoteDTO {
	out := deliveryQuoteDTO{
		Postcode: q.Postcode, Serviced: q.Serviced, Packages: []quotePackageDTO{},
		SameDaySlots: []slotOptionDTO{}, StandardDays: []standardDayDTO{},
	}
	if q.Serviced {
		out.ExpiresAt = q.ExpiresAt.Format(time.RFC3339)
		if q.SameDayUntil != nil {
			s := melbourneStamp(q.SameDayUntil)
			out.SameDayAvailableUntil = &s
		}
		if q.SameDayUnavailable != "" {
			reason := q.SameDayUnavailable
			out.SameDayUnavailableReason = &reason
		}
		for _, s := range q.SameDaySlots {
			start, end, cutoff := s.Start, s.End, s.Cutoff
			out.SameDaySlots = append(out.SameDaySlots, slotOptionDTO{
				SlotID: s.ID, Date: s.Date,
				StartAt: melbourneStamp(&start), EndAt: melbourneStamp(&end), CutoffAt: melbourneStamp(&cutoff),
			})
		}
		for _, d := range q.StandardDays {
			out.StandardDays = append(out.StandardDays, standardDayDTO{Date: d})
		}
		for _, p := range q.Packages {
			opts := make([]quoteOptionDTO, 0, len(p.Options))
			for _, o := range p.Options {
				opts = append(opts, quoteOptionDTO{Method: o.Method, FeeAmount: money.FormatCents(o.FeeCents)})
			}
			out.Packages = append(out.Packages, quotePackageDTO{ShopRef: p.ShopRef, Options: opts})
		}
	}
	return out
}

// Register mounts the customer checkout routes (auth+identity) and the public signature-verified webhook.
func Register(v1 *gin.RouterGroup, verifier *auth.PoolVerifier, identity *customeridentity.Resolver, h *Handler) {
	g := v1.Group("/checkout", auth.Middleware(verifier), customeridentity.Middleware(identity))
	g.POST("/quote", h.quote) // 047: delivery preview before payment
	g.POST("/intent", h.createIntent)
	g.POST("/confirm", h.confirm)

	// 051 — kept cards. Scoped to the authenticated subject: there is no customer parameter and no admin
	// form of these routes. HOT PATH by the 011 routing law ("payment"), and because the provider secret
	// never leaves this package — a cold-path implementation would need a second copy of it (research R9).
	pm := v1.Group("/payment-methods", auth.Middleware(verifier), customeridentity.Middleware(identity))
	pm.GET("", h.listPaymentMethods)
	pm.DELETE("/:id", h.removePaymentMethod)

	// Stripe → server-to-server, no Cognito token; authenticated by the Stripe signature (raw body).
	v1.POST("/stripe/webhook", h.webhook)
}

// belowMinimum unwraps the minimum-spend refusal, or nil.
func belowMinimum(err error) *BelowMinimumError {
	var e *BelowMinimumError
	if errors.As(err, &e) {
		return e
	}
	return nil
}
