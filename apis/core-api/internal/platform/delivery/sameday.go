package delivery

import "time"

// ── Same-day eligibility (032) ─────────────────────────────────────────────────────────────────
//
// ⚠ THIS FILE REPLACES THE RULE THAT MOTIVATED THE WHOLE FEATURE.
//
// Until 032, same-day was offered when a `delivery_offering` row existed for the package's
// (origin zone → destination zone) pair. Zone REGIONAL holds both Ballarat and Bendigo, so same-day
// to Ballarat was permitted by a shop in Bendigo — 98 km away, essentially as far as Melbourne. The
// check reported "a shop is nearby" and carried no information whatsoever.
//
// Eligibility is now a statement a SHOP made and an ADMIN approved, about areas it can actually
// reach. Zone membership is a precondition, never evidence for.

// SamedayApproval is a shop's approved same-day coverage. Nil means no approval is in force, which is
// the default and the safe state — a shop with no approval offers no same-day, ever.
type SamedayApproval struct {
	// Postcodes the shop is approved to serve. Membership is exact: an area IS a postcode.
	Postcodes map[string]bool
	// Cutoff is a wall-clock time-of-day in the platform's operating timezone (see Melbourne).
	// ⚠ Never nil on an approval that reached here: the schema's shop_sameday_cutoff_ck makes
	// "same-day, no cutoff" unrepresentable, because it would leave the withdrawal rule undecidable.
	Cutoff *time.Time
}

// Melbourne is the platform's operating timezone, and the ONLY clock a same-day cutoff is judged
// against.
//
// ⚠ NOT UTC AND NOT THE SHOPPER'S DEVICE. `cutoff_time` is a `time` with no zone — a wall-clock fact
// about a shop's working day ("we stop packing at 2pm"), not an instant. Evaluating it against a UTC
// container clock puts the cutoff 10 or 11 hours wrong depending on daylight saving, and the fault
// would appear only in the evening and only in summer: the hardest possible bug to notice and the
// easiest to dismiss as a one-off.
var Melbourne = mustLoadMelbourne()

func mustLoadMelbourne() *time.Location {
	loc, err := time.LoadLocation("Australia/Melbourne")
	if err != nil {
		// ⚠ A container without tzdata would otherwise silently fall back to UTC and shift every
		// cutoff by ten hours. A fixed +10:00 is wrong for half the year, but it is wrong by ONE hour
		// rather than ten, and it is deterministic.
		return time.FixedZone("AEST", 10*60*60)
	}
	return loc
}

// SamedayOffered reports whether same-day may be offered for one package.
//
// ⚠ FOUR TERMS, ALL REQUIRED, AND THE FOURTH IS THE ONE A READER WILL THINK REDUNDANT:
//
//  1. the fulfilling shop has an approval in force;
//  2. the destination postcode is in that approval's areas;
//  3. now — in Melbourne — is before the cutoff;
//  4. the destination is still serviced at all.
//
// Term 4 (FR-030a) is not redundant. An approval is a claim about a SHOP's reach, not a grant of
// serviceability. If an area is later removed from every delivery zone, an approval covering it would
// otherwise keep producing same-day offers into a place the platform no longer serves — the approval
// outliving the service it depends on, silently.
//
// ⚠ ZONE MEMBERSHIP IS NOT IN THIS LIST AS EVIDENCE FOR (FR-029). `destServiced` is a precondition:
// sharing a zone with a shopper grants nothing. That is precisely the rule being replaced.
func SamedayOffered(a *SamedayApproval, destPostcode string, destServiced bool, now time.Time) bool {
	if a == nil || !destServiced {
		return false
	}
	if !a.Postcodes[destPostcode] {
		return false
	}
	return !pastCutoffIn(a.Cutoff, now, Melbourne)
}

// SamedayOption builds the selectable same-day option once eligibility holds. The FEE is not decided
// here — Price does that, from the platform's rules (FR-008).
func SamedayOption() Option {
	return Option{
		Method:       MethodSameDay,
		ServiceLevel: serviceLevelLabel(MethodSameDay),
		Window:       "Today",
	}
}

// pastCutoffIn compares now's time-of-day, IN loc, against the cutoff's time-of-day.
//
// ⚠ `now.In(loc)` before reading the clock fields. Reading Hour()/Minute() off a UTC time and
// comparing them to a Melbourne wall-clock cutoff is the bug this whole function exists to prevent.
func pastCutoffIn(cutoff *time.Time, now time.Time, loc *time.Location) bool {
	if cutoff == nil {
		// ⚠ Unreachable for a stored approval (the CHECK constraint forbids it). Treated as "already
		// past" rather than "never withdraw": if the guarantee is ever broken, failing to OFFER is
		// recoverable and offering a promise with no end is not.
		return true
	}
	local := now.In(loc)
	nowMins := local.Hour()*60 + local.Minute()
	cutMins := cutoff.Hour()*60 + cutoff.Minute()
	return nowMins >= cutMins
}
