// Package deliveryinstructions is the hot path's copy of ONE rule: what a customer may tell a driver
// (066). A handover preference from a closed set, and a note of at most 250 characters.
//
// ⚠ THIS IS A MIRROR, AND IT IS PINNED. The rule's home is
// `packages/shared-types/src/delivery-instructions.ts`, which both customer surfaces and the cold
// path import. Go cannot import TypeScript, so the same steps are written here — and
// `deliveryinstructions_test.go` reads the SAME fixture file that the TypeScript suite reads. A step
// changed on one side and not the other fails that test, naming the case.
//
// ⚠ NOTHING HERE EVER RETURNS OR WRAPS THE SUBMITTED TEXT. A note can hold a gate code or a phone
// number, and an error is exactly the kind of value that ends up in a log line (FR-028).
package deliveryinstructions

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"
)

// NoteMax is the note's limit, in Unicode code points — an emoji is one character to the person
// typing it, and PostgreSQL's char_length (the database backstop) counts the same way.
const NoteMax = 250

const (
	HandoverLeaveAtDoor = "leave_at_door"
	HandoverMeetAtDoor  = "meet_at_door"
)

var (
	// ErrHandoverInvalid: the handover preference is not one of the closed set.
	ErrHandoverInvalid = errors.New("delivery instructions: handover is not a known preference")
	// ErrNoteInvalid: the note is not text.
	ErrNoteInvalid = errors.New("delivery instructions: note is not text")
	// ErrNoteTooLong: the note exceeds NoteMax after normalising. Never truncated — cutting a
	// customer's sentence in half could cut it before "not".
	ErrNoteTooLong = errors.New("delivery instructions: note is too long")
)

// Instructions is what gets stored. A nil part is "not given"; both nil is "no instructions".
type Instructions struct {
	Handover *string
	Note     *string
}

// Empty reports whether the customer said nothing at all.
func (i Instructions) Empty() bool { return i.Handover == nil && i.Note == nil }

// NormaliseNote returns the note as it will be stored, or nil when nothing is left:
//
//  1. line endings become \n; tabs become spaces
//  2. control characters other than \n are removed
//  3. within each line, runs of spaces collapse to one and the line is trimmed
//  4. empty lines are dropped
func NormaliseNote(raw string) *string {
	s := strings.ReplaceAll(raw, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	s = strings.ReplaceAll(s, "\t", " ")
	s = strings.Map(func(r rune) rune {
		if r != '\n' && unicode.IsControl(r) {
			return -1
		}
		return r
	}, s)

	var kept []string
	for _, line := range strings.Split(s, "\n") {
		for strings.Contains(line, "  ") {
			line = strings.ReplaceAll(line, "  ", " ")
		}
		// Unicode whitespace, as String.prototype.trim does on the TypeScript side.
		line = strings.TrimFunc(line, unicode.IsSpace)
		if line != "" {
			kept = append(kept, line)
		}
	}
	if len(kept) == 0 {
		return nil
	}
	out := strings.Join(kept, "\n")
	return &out
}

// Normalise validates already-typed parts.
func Normalise(handover, note *string) (Instructions, error) {
	var out Instructions
	if handover != nil {
		if *handover != HandoverLeaveAtDoor && *handover != HandoverMeetAtDoor {
			return Instructions{}, ErrHandoverInvalid
		}
		h := *handover
		out.Handover = &h
	}
	if note != nil {
		n := NormaliseNote(*note)
		if n != nil && utf8.RuneCountInString(*n) > NoteMax {
			return Instructions{}, ErrNoteTooLong
		}
		out.Note = n
	}
	return out, nil
}

// ParseJSON validates whatever a client sent in the `deliveryInstructions` field. An absent field,
// `null`, and an object with both parts empty all mean "no instructions".
func ParseJSON(raw json.RawMessage) (Instructions, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return Instructions{}, nil
	}
	var wire struct {
		Handover json.RawMessage `json:"handover"`
		Note     json.RawMessage `json:"note"`
	}
	if err := json.Unmarshal(trimmed, &wire); err != nil {
		return Instructions{}, ErrNoteInvalid
	}
	handover, err := optionalString(wire.Handover)
	if err != nil {
		return Instructions{}, ErrHandoverInvalid
	}
	note, err := optionalString(wire.Note)
	if err != nil {
		return Instructions{}, ErrNoteInvalid
	}
	return Normalise(handover, note)
}

func optionalString(raw json.RawMessage) (*string, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil, nil
	}
	var s string
	if err := json.Unmarshal(trimmed, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

// FieldAndReason maps an error from this package to the wire's refusal vocabulary — the same
// `field` / `reason` pair the TypeScript rule returns.
func FieldAndReason(err error) (field, reason string) {
	switch {
	case errors.Is(err, ErrHandoverInvalid):
		return "handover", "invalid"
	case errors.Is(err, ErrNoteTooLong):
		return "note", "too_long"
	default:
		return "note", "invalid"
	}
}
