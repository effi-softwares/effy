package adminbootstrap

import (
	"context"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	cip "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
)

type fakeCognito struct {
	createFn      func(*cip.AdminCreateUserInput) (*cip.AdminCreateUserOutput, error)
	getFn         func(*cip.AdminGetUserInput) (*cip.AdminGetUserOutput, error)
	enableFn      func(*cip.AdminEnableUserInput) (*cip.AdminEnableUserOutput, error)
	deleteFn      func(*cip.AdminDeleteUserInput) (*cip.AdminDeleteUserOutput, error)
	addGroupCalls int
}

func (f *fakeCognito) AdminCreateUser(_ context.Context, in *cip.AdminCreateUserInput, _ ...func(*cip.Options)) (*cip.AdminCreateUserOutput, error) {
	return f.createFn(in)
}
func (f *fakeCognito) AdminGetUser(_ context.Context, in *cip.AdminGetUserInput, _ ...func(*cip.Options)) (*cip.AdminGetUserOutput, error) {
	return f.getFn(in)
}
func (f *fakeCognito) AdminEnableUser(_ context.Context, in *cip.AdminEnableUserInput, _ ...func(*cip.Options)) (*cip.AdminEnableUserOutput, error) {
	return f.enableFn(in)
}
func (f *fakeCognito) AdminAddUserToGroup(_ context.Context, in *cip.AdminAddUserToGroupInput, _ ...func(*cip.Options)) (*cip.AdminAddUserToGroupOutput, error) {
	f.addGroupCalls++
	if aws.ToString(in.GroupName) != RoleAdmin {
		panic("expected admin group")
	}
	return &cip.AdminAddUserToGroupOutput{}, nil
}
func (f *fakeCognito) AdminDeleteUser(_ context.Context, in *cip.AdminDeleteUserInput, _ ...func(*cip.Options)) (*cip.AdminDeleteUserOutput, error) {
	return f.deleteFn(in)
}

func TestResolveAdmin_FoundAndNotFound(t *testing.T) {
	found := &fakeCognito{getFn: func(*cip.AdminGetUserInput) (*cip.AdminGetUserOutput, error) {
		return &cip.AdminGetUserOutput{
			Username:       aws.String("uuid-1"),
			UserAttributes: []types.AttributeType{{Name: aws.String("sub"), Value: aws.String("uuid-1")}},
		}, nil
	}}
	sub, username, ok, err := NewCognito(found, "pool").ResolveAdmin(context.Background(), "a@b.com")
	if err != nil || !ok || sub != "uuid-1" || username != "uuid-1" {
		t.Fatalf("found: sub=%q username=%q ok=%v err=%v", sub, username, ok, err)
	}

	gone := &fakeCognito{getFn: func(*cip.AdminGetUserInput) (*cip.AdminGetUserOutput, error) {
		return nil, &types.UserNotFoundException{}
	}}
	_, _, ok, err = NewCognito(gone, "pool").ResolveAdmin(context.Background(), "a@b.com")
	if err != nil || ok {
		t.Fatalf("not-found: ok=%v err=%v (want ok=false, nil err)", ok, err)
	}
}

func TestDeleteAdmin_DeletedAndAlreadyGone(t *testing.T) {
	ok := &fakeCognito{deleteFn: func(*cip.AdminDeleteUserInput) (*cip.AdminDeleteUserOutput, error) {
		return &cip.AdminDeleteUserOutput{}, nil
	}}
	deleted, err := NewCognito(ok, "pool").DeleteAdmin(context.Background(), "uuid-1")
	if err != nil || !deleted {
		t.Fatalf("delete: deleted=%v err=%v", deleted, err)
	}

	gone := &fakeCognito{deleteFn: func(*cip.AdminDeleteUserInput) (*cip.AdminDeleteUserOutput, error) {
		return nil, &types.UserNotFoundException{}
	}}
	deleted, err = NewCognito(gone, "pool").DeleteAdmin(context.Background(), "uuid-1")
	if err != nil || deleted {
		t.Fatalf("already-gone: deleted=%v err=%v (want deleted=false, nil err)", deleted, err)
	}
}

func TestEnsureAdmin_CreatePath_PasswordlessConfirmed(t *testing.T) {
	f := &fakeCognito{
		createFn: func(in *cip.AdminCreateUserInput) (*cip.AdminCreateUserOutput, error) {
			if in.MessageAction != types.MessageActionTypeSuppress {
				t.Errorf("expected MessageAction=SUPPRESS, got %v", in.MessageAction)
			}
			if in.TemporaryPassword != nil {
				t.Errorf("expected NO temporary password (passwordless → CONFIRMED)")
			}
			return &cip.AdminCreateUserOutput{User: &types.UserType{
				Username:   aws.String("uuid-123"),
				Attributes: []types.AttributeType{{Name: aws.String("sub"), Value: aws.String("uuid-123")}},
			}}, nil
		},
	}
	sub, outcome, err := NewCognito(f, "pool").EnsureAdmin(context.Background(), "a@b.com", "A B")
	if err != nil {
		t.Fatal(err)
	}
	if sub != "uuid-123" || outcome != "created" {
		t.Errorf("got sub=%q outcome=%q", sub, outcome)
	}
	if f.addGroupCalls != 1 {
		t.Errorf("expected AdminAddUserToGroup once, got %d", f.addGroupCalls)
	}
}

func TestEnsureAdmin_AlreadyExists_Reconciles(t *testing.T) {
	f := &fakeCognito{
		createFn: func(*cip.AdminCreateUserInput) (*cip.AdminCreateUserOutput, error) {
			return nil, &types.UsernameExistsException{}
		},
		getFn: func(*cip.AdminGetUserInput) (*cip.AdminGetUserOutput, error) {
			return &cip.AdminGetUserOutput{
				Username:       aws.String("uuid-existing"),
				Enabled:        true,
				UserAttributes: []types.AttributeType{{Name: aws.String("sub"), Value: aws.String("uuid-existing")}},
			}, nil
		},
	}
	sub, outcome, err := NewCognito(f, "pool").EnsureAdmin(context.Background(), "a@b.com", "A B")
	if err != nil {
		t.Fatal(err)
	}
	if sub != "uuid-existing" || outcome != "already-exists" {
		t.Errorf("got sub=%q outcome=%q", sub, outcome)
	}
	if f.addGroupCalls != 1 {
		t.Errorf("expected group membership re-asserted on reconcile")
	}
}

func TestEnsureAdmin_DisabledUser_IsEnabled(t *testing.T) {
	enabled := false
	f := &fakeCognito{
		createFn: func(*cip.AdminCreateUserInput) (*cip.AdminCreateUserOutput, error) {
			return nil, &types.UsernameExistsException{}
		},
		getFn: func(*cip.AdminGetUserInput) (*cip.AdminGetUserOutput, error) {
			return &cip.AdminGetUserOutput{
				Username:       aws.String("u"),
				Enabled:        false,
				UserAttributes: []types.AttributeType{{Name: aws.String("sub"), Value: aws.String("u")}},
			}, nil
		},
		enableFn: func(*cip.AdminEnableUserInput) (*cip.AdminEnableUserOutput, error) {
			enabled = true
			return &cip.AdminEnableUserOutput{}, nil
		},
	}
	if _, _, err := NewCognito(f, "pool").EnsureAdmin(context.Background(), "a@b.com", "A B"); err != nil {
		t.Fatal(err)
	}
	if !enabled {
		t.Errorf("expected a disabled user to be re-enabled (break-glass)")
	}
}

func TestSubFromAttrs(t *testing.T) {
	attrs := []types.AttributeType{
		{Name: aws.String("email"), Value: aws.String("x@y.com")},
		{Name: aws.String("sub"), Value: aws.String("S")},
	}
	if got := subFromAttrs(attrs); got != "S" {
		t.Errorf("got %q, want S", got)
	}
	if got := subFromAttrs(nil); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}
