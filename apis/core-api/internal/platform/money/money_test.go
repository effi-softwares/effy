package money

import "testing"

func TestParseCents(t *testing.T) {
	cases := map[string]int64{
		"5.00": 500, "5": 500, "5.5": 550, "0.99": 99, "12.34": 1234, "0": 0, "-3.50": -350,
		"5.009": 500, // truncates beyond 2dp
	}
	for in, want := range cases {
		got, err := ParseCents(in)
		if err != nil {
			t.Fatalf("ParseCents(%q): %v", in, err)
		}
		if got != want {
			t.Errorf("ParseCents(%q) = %d, want %d", in, got, want)
		}
	}
	if _, err := ParseCents("abc"); err == nil {
		t.Error("expected error for non-numeric")
	}
}

func TestFormatCents(t *testing.T) {
	cases := map[int64]string{500: "5.00", 99: "0.99", 1234: "12.34", 0: "0.00", -350: "-3.50"}
	for in, want := range cases {
		if got := FormatCents(in); got != want {
			t.Errorf("FormatCents(%d) = %q, want %q", in, got, want)
		}
	}
}

func TestRoundTrip(t *testing.T) {
	for _, s := range []string{"5.00", "0.99", "123.45"} {
		c, _ := ParseCents(s)
		if got := FormatCents(c); got != s {
			t.Errorf("round-trip %q → %d → %q", s, c, got)
		}
	}
}
