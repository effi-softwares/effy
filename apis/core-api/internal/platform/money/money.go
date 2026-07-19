// Package money does exact decimal arithmetic in integer minor units (cents), never floats (research
// R9). Amounts cross the wire as 2-dp decimal strings (from numeric(12,2)::text); we parse to cents,
// compute, and format back. Single currency (AUD) this slice.
package money

import (
	"fmt"
	"strconv"
	"strings"
)

// ParseCents parses a decimal string ("5", "5.5", "5.00") to integer cents. Extra fractional digits
// beyond 2 are truncated; a malformed value errors.
func ParseCents(s string) (int64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, fmt.Errorf("money: empty amount")
	}
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")

	whole, frac, _ := strings.Cut(s, ".")
	if whole == "" {
		whole = "0"
	}
	w, err := strconv.ParseInt(whole, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("money: bad amount %q: %w", s, err)
	}
	// Normalise the fractional part to exactly 2 digits.
	if len(frac) > 2 {
		frac = frac[:2]
	}
	for len(frac) < 2 {
		frac += "0"
	}
	f, err := strconv.ParseInt(frac, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("money: bad fraction in %q: %w", s, err)
	}
	cents := w*100 + f
	if neg {
		cents = -cents
	}
	return cents, nil
}

// FormatCents renders integer cents as a 2-dp decimal string ("500" → "5.00").
func FormatCents(cents int64) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	out := fmt.Sprintf("%d.%02d", cents/100, cents%100)
	if neg {
		out = "-" + out
	}
	return out
}
