package saveditems

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// ── The name rule (068 FR-002, research R3) ─────────────────────────────────────────────────────

func TestNormaliseListName(t *testing.T) {
	forty := strings.Repeat("a", ListNameMax)
	cases := []struct {
		name string
		in   string
		want string
		err  error
	}{
		{"plain", "Weekly Items", "Weekly Items", nil},
		{"trims both ends", "  Weekly Items \n", "Weekly Items", nil},
		{"collapses inner whitespace", "Weekly \t\n  Items", "Weekly Items", nil},
		{"drops control characters", "Week\x00ly\x07", "Weekly", nil},
		{"empty", "", "", ErrInvalidName},
		{"only whitespace", " \t\n ", "", ErrInvalidName},
		{"only control characters", "\x00\x01", "", ErrInvalidName},
		{"exactly the limit", forty, forty, nil},
		{"one over the limit", forty + "a", "", ErrInvalidName},
		// ⚠ Code points, not bytes and not UTF-16 units. 40 emoji are 160 bytes and 80 UTF-16 units,
		// and still forty characters to the person who typed them.
		{"forty emoji", strings.Repeat("🥚", ListNameMax), strings.Repeat("🥚", ListNameMax), nil},
		{"forty-one emoji", strings.Repeat("🥚", ListNameMax+1), "", ErrInvalidName},
		{"over the limit only before trimming", forty + "   ", forty, nil},
		{"non-English", "週の買い物", "週の買い物", nil},
		{"markup is just characters", "<script>x</script>", "<script>x</script>", nil},
		{"the default's name", "Saved", "", ErrNameTaken},
		{"the default's name in another case", "  sAVED ", "", ErrNameTaken},
		{"a name that merely contains it", "Saved for later", "Saved for later", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormaliseListName(tc.in)
			if tc.err != nil {
				require.ErrorIs(t, err, tc.err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
}

// ── The service refuses before the repository is asked (SC-009) ─────────────────────────────────

func TestCreateList_RefusesABadNameWithoutTouchingTheStore(t *testing.T) {
	repo := &fakeRepo{}
	s := svc(repo, nil)

	_, err := s.CreateList(context.Background(), cust, strings.Repeat("x", ListNameMax+1), nil)
	require.ErrorIs(t, err, ErrInvalidName)
	_, err = s.CreateList(context.Background(), cust, "saved", nil)
	require.ErrorIs(t, err, ErrNameTaken)
	require.Empty(t, repo.createdName, "nothing reached the repository")
}

func TestCreateList_StoresTheNormalisedNameAndPassesBothLimits(t *testing.T) {
	repo := &fakeRepo{}
	s := svc(repo, nil)

	l, err := s.CreateList(context.Background(), cust, "  Weekly   Items ", ptr(prod))
	require.NoError(t, err)
	require.Equal(t, "Weekly Items", repo.createdName)
	require.Equal(t, [2]int{ListLimit, AccountCap}, repo.createdCap)
	require.Equal(t, prod, *repo.createdProd)
	require.Equal(t, "Weekly Items", *l.Name)
}

func TestCreateList_MalformedProductIsNotFound(t *testing.T) {
	repo := &fakeRepo{}
	_, err := svc(repo, nil).CreateList(context.Background(), cust, "Weekly Items", ptr("not-a-uuid"))
	require.ErrorIs(t, err, ErrProductNotFound)
	require.Empty(t, repo.createdName)
}

func TestRenameList_TheDefaultIsRefusedBeforeTheNameIsRead(t *testing.T) {
	repo := &fakeRepo{}
	// An over-long name AND the default list: "you cannot rename this" is the answer that matters.
	_, err := svc(repo, nil).RenameList(context.Background(), cust, DefaultListRef, strings.Repeat("x", 99))
	require.ErrorIs(t, err, ErrDefaultList)
	require.Empty(t, repo.renamedTo)
}

func TestLists_SuppliesTheDefaultWhenTheShopperHasNoRowForIt(t *testing.T) {
	name := "Weekly Items"
	repo := &fakeRepo{lists: []listSummaryRow{{ID: namedList, Name: &name, Count: 2}}}

	lists, err := svc(repo, nil).Lists(context.Background(), cust, nil)
	require.NoError(t, err)
	require.Len(t, lists, 2)
	require.Equal(t, DefaultListRef, lists[0].ID)
	require.True(t, lists[0].IsDefault)
	require.Equal(t, namedList, lists[1].ID)
}

func TestLists_TheDefaultsRealIDNeverLeavesTheService(t *testing.T) {
	repo := &fakeRepo{lists: []listSummaryRow{{ID: "0d000000-0000-0000-0000-00000000000d", IsDefault: true, Count: 3}}}

	lists, err := svc(repo, nil).Lists(context.Background(), cust, nil)
	require.NoError(t, err)
	require.Len(t, lists, 1)
	require.Equal(t, DefaultListRef, lists[0].ID)
}

func TestAddEntry_MalformedProductIsNotFoundAndRemoveIsANoOp(t *testing.T) {
	repo := &fakeRepo{}
	s := svc(repo, nil)
	require.ErrorIs(t, s.AddEntry(context.Background(), cust, namedList, "nope", nil), ErrProductNotFound)
	require.NoError(t, s.RemoveEntry(context.Background(), cust, namedList, "nope"))
	require.Empty(t, repo.entryRef)
	require.Empty(t, repo.removedRef)
}

// ── Membership (FR-021) ─────────────────────────────────────────────────────────────────────────

func TestMembership_CarriesTheNamedSubset(t *testing.T) {
	repo := &fakeRepo{membership: []string{prod, "p2"}, named: []string{prod}}
	m, err := svc(repo, nil).Membership(context.Background(), cust)
	require.NoError(t, err)
	require.Equal(t, []string{prod}, m.NamedProductIDs)
}

func TestMembership_NamedIsEmptyNotNilForAShopperWithNothingSaved(t *testing.T) {
	m, err := svc(&fakeRepo{}, nil).Membership(context.Background(), cust)
	require.NoError(t, err)
	require.NotNil(t, m.NamedProductIDs)
	require.Empty(t, m.NamedProductIDs)
}

func TestAddAll_ReadsTheListItWasGiven(t *testing.T) {
	repo := &fakeRepo{rows: []listRow{row(VerdictPurchasable)}}
	s := svc(repo, nil).WithCart(&fakeCart{})
	_, err := s.AddAllToCart(context.Background(), cust, namedList, "0b000000-0000-0000-0000-00000000000b")
	require.NoError(t, err)
	require.Equal(t, namedList, repo.listedRef)
}
