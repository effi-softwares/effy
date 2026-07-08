package adminbootstrap

import (
	"context"
	"errors"
	"testing"
)

type fakeDeleterIdP struct {
	sub, username string
	found         bool
	deleted       bool
	deleteCalls   int
}

func (f *fakeDeleterIdP) ResolveAdmin(context.Context, string) (string, string, bool, error) {
	return f.sub, f.username, f.found, nil
}
func (f *fakeDeleterIdP) DeleteAdmin(context.Context, string) (bool, error) {
	f.deleteCalls++
	return f.deleted, nil
}

type fakeDeleterRepo struct {
	isLast      bool
	staffOut    string
	deleteCalls int
}

func (f *fakeDeleterRepo) IsLastActiveAdmin(context.Context, string) (bool, error) {
	return f.isLast, nil
}
func (f *fakeDeleterRepo) DeleteAdmin(context.Context, string, string) (string, error) {
	f.deleteCalls++
	return f.staffOut, nil
}

func TestDelete_HappyPath(t *testing.T) {
	idp := &fakeDeleterIdP{sub: "S", username: "S", found: true, deleted: true}
	repo := &fakeDeleterRepo{isLast: false, staffOut: "deleted"}
	res, err := Delete(context.Background(), idp, repo, "a@b.com", false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Cognito != "deleted" || res.Staff != "deleted" || res.Subject != "S" {
		t.Errorf("unexpected result: %+v", res)
	}
}

func TestDelete_AlreadyGone(t *testing.T) {
	idp := &fakeDeleterIdP{found: false} // not in Cognito
	repo := &fakeDeleterRepo{staffOut: "not-found"}
	res, err := Delete(context.Background(), idp, repo, "a@b.com", false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Cognito != "not-found" || res.Staff != "not-found" {
		t.Errorf("unexpected result: %+v", res)
	}
	if idp.deleteCalls != 0 {
		t.Errorf("should not call AdminDeleteUser for an absent user")
	}
	if repo.deleteCalls != 1 {
		t.Errorf("should still attempt DB residue cleanup")
	}
}

func TestDelete_LastAdmin_RefusedThenForced(t *testing.T) {
	// Refused without force — nothing deleted.
	idp := &fakeDeleterIdP{sub: "S", username: "S", found: true, deleted: true}
	repo := &fakeDeleterRepo{isLast: true, staffOut: "deleted"}
	_, err := Delete(context.Background(), idp, repo, "a@b.com", false)
	if !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("expected ErrLastAdmin, got %v", err)
	}
	if idp.deleteCalls != 0 || repo.deleteCalls != 0 {
		t.Errorf("guard must block before any delete (idp=%d repo=%d)", idp.deleteCalls, repo.deleteCalls)
	}

	// With force — proceeds despite being the last admin.
	idp2 := &fakeDeleterIdP{sub: "S", username: "S", found: true, deleted: true}
	repo2 := &fakeDeleterRepo{isLast: true, staffOut: "deleted"}
	res, err := Delete(context.Background(), idp2, repo2, "a@b.com", true)
	if err != nil {
		t.Fatal(err)
	}
	if res.Cognito != "deleted" || res.Staff != "deleted" {
		t.Errorf("force should proceed: %+v", res)
	}
}

func TestDelete_InvalidEmail(t *testing.T) {
	if _, err := Delete(context.Background(), &fakeDeleterIdP{}, &fakeDeleterRepo{}, "notanemail", false); err == nil {
		t.Error("expected invalid-email error")
	}
}
