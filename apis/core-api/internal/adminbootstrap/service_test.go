package adminbootstrap

import (
	"context"
	"errors"
	"testing"
)

type fakeIdP struct {
	sub, outcome string
	err          error
}

func (f fakeIdP) EnsureAdmin(context.Context, string, string) (string, string, error) {
	return f.sub, f.outcome, f.err
}

type fakeRepo struct {
	outcome string
	err     error
}

func (f fakeRepo) UpsertSuperAdmin(context.Context, string, string, string) (string, error) {
	return f.outcome, f.err
}

func TestRun_HappyPath(t *testing.T) {
	res, err := Run(
		context.Background(),
		fakeIdP{sub: "S", outcome: "created"},
		fakeRepo{outcome: "created"},
		Input{Email: "a@b.com", Name: "A"},
	)
	if err != nil {
		t.Fatal(err)
	}
	if res.Subject != "S" || res.Cognito != "created" || res.Staff != "created" ||
		res.Role != RoleAdmin || res.Group != RoleAdmin || res.Email != "a@b.com" {
		t.Errorf("unexpected result: %+v", res)
	}
}

func TestRun_CognitoError_StopsBeforeDB(t *testing.T) {
	_, err := Run(
		context.Background(),
		fakeIdP{err: errors.New("boom")},
		fakeRepo{outcome: "created"}, // must not be reached
		Input{Email: "a@b.com", Name: "A"},
	)
	if err == nil {
		t.Fatal("expected error when Cognito fails")
	}
}

func TestValidate(t *testing.T) {
	if err := (Input{Email: "a@b.com", Name: "Jane"}).Validate(); err != nil {
		t.Errorf("valid input rejected: %v", err)
	}
	if err := (Input{Email: "notanemail", Name: "Jane"}).Validate(); err == nil {
		t.Errorf("malformed email accepted")
	}
	if err := (Input{Email: "a@b.com", Name: "   "}).Validate(); err == nil {
		t.Errorf("empty name accepted")
	}
}
