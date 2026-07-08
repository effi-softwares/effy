package adminbootstrap

import (
	"context"
	"errors"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	cip "github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"
)

// CognitoAPI is the subset of the Cognito Identity Provider client this package uses (a seam for
// tests). *cognitoidentityprovider.Client satisfies it.
type CognitoAPI interface {
	AdminCreateUser(ctx context.Context, in *cip.AdminCreateUserInput, optFns ...func(*cip.Options)) (*cip.AdminCreateUserOutput, error)
	AdminGetUser(ctx context.Context, in *cip.AdminGetUserInput, optFns ...func(*cip.Options)) (*cip.AdminGetUserOutput, error)
	AdminEnableUser(ctx context.Context, in *cip.AdminEnableUserInput, optFns ...func(*cip.Options)) (*cip.AdminEnableUserOutput, error)
	AdminAddUserToGroup(ctx context.Context, in *cip.AdminAddUserToGroupInput, optFns ...func(*cip.Options)) (*cip.AdminAddUserToGroupOutput, error)
	AdminDeleteUser(ctx context.Context, in *cip.AdminDeleteUserInput, optFns ...func(*cip.Options)) (*cip.AdminDeleteUserOutput, error)
}

// Cognito is the identity-provider adapter for the back-office pool.
type Cognito struct {
	api    CognitoAPI
	poolID string
}

// NewCognito wires the adapter to a client + the back-office pool id.
func NewCognito(api CognitoAPI, poolID string) *Cognito {
	return &Cognito{api: api, poolID: poolID}
}

// EnsureAdmin creates a PASSWORDLESS, CONFIRMED user (no TemporaryPassword → not
// FORCE_CHANGE_PASSWORD → can EMAIL_OTP immediately — research F1/F2), suppressing the invite
// email, then ensures `admin` group membership. On re-run it reconciles an existing user
// (break-glass — research F4). Returns the immutable `sub` (the token/DB join key — research F3).
func (c *Cognito) EnsureAdmin(ctx context.Context, email, name string) (string, string, error) {
	created, err := c.api.AdminCreateUser(ctx, &cip.AdminCreateUserInput{
		UserPoolId:    aws.String(c.poolID),
		Username:      aws.String(email), // username_attributes=[email] → Cognito generates a UUID username = sub (research F5)
		MessageAction: types.MessageActionTypeSuppress,
		UserAttributes: []types.AttributeType{
			{Name: aws.String("email"), Value: aws.String(email)},
			{Name: aws.String("email_verified"), Value: aws.String("true")},
			{Name: aws.String("name"), Value: aws.String(name)},
		},
		// No TemporaryPassword — required to land the user CONFIRMED on a passwordless pool.
	})

	var (
		outcome  string
		username string
		sub      string
	)

	if err != nil {
		var exists *types.UsernameExistsException
		if !errors.As(err, &exists) {
			return "", "", fmt.Errorf("AdminCreateUser: %w", err)
		}
		// Reconcile an existing user (break-glass).
		outcome = "already-exists"
		got, gerr := c.api.AdminGetUser(ctx, &cip.AdminGetUserInput{
			UserPoolId: aws.String(c.poolID),
			Username:   aws.String(email),
		})
		if gerr != nil {
			return "", "", fmt.Errorf("AdminGetUser: %w", gerr)
		}
		username = aws.ToString(got.Username)
		sub = subFromAttrs(got.UserAttributes)
		if !got.Enabled {
			if _, eerr := c.api.AdminEnableUser(ctx, &cip.AdminEnableUserInput{
				UserPoolId: aws.String(c.poolID),
				Username:   aws.String(username),
			}); eerr != nil {
				return "", "", fmt.Errorf("AdminEnableUser: %w", eerr)
			}
		}
	} else {
		outcome = "created"
		username = aws.ToString(created.User.Username)
		sub = subFromAttrs(created.User.Attributes)
	}

	if sub == "" {
		return "", "", errors.New("cognito: no sub attribute in response")
	}

	// Idempotent: adding an already-member is a no-op (research F4).
	if _, aerr := c.api.AdminAddUserToGroup(ctx, &cip.AdminAddUserToGroupInput{
		UserPoolId: aws.String(c.poolID),
		Username:   aws.String(username),
		GroupName:  aws.String(RoleAdmin),
	}); aerr != nil {
		return "", "", fmt.Errorf("AdminAddUserToGroup: %w", aerr)
	}

	return sub, outcome, nil
}

func subFromAttrs(attrs []types.AttributeType) string {
	for _, a := range attrs {
		if aws.ToString(a.Name) == "sub" {
			return aws.ToString(a.Value)
		}
	}
	return ""
}

// ResolveAdmin looks a user up by email and returns the immutable sub + the real (UUID) username.
// found is false when the user does not exist (idempotent teardown — research G1).
func (c *Cognito) ResolveAdmin(ctx context.Context, email string) (sub, username string, found bool, err error) {
	out, gerr := c.api.AdminGetUser(ctx, &cip.AdminGetUserInput{
		UserPoolId: aws.String(c.poolID),
		Username:   aws.String(email),
	})
	if gerr != nil {
		var nf *types.UserNotFoundException
		if errors.As(gerr, &nf) {
			return "", "", false, nil
		}
		return "", "", false, fmt.Errorf("AdminGetUser: %w", gerr)
	}
	return subFromAttrs(out.UserAttributes), aws.ToString(out.Username), true, nil
}

// DeleteAdmin hard-deletes the user (group memberships vanish with them). deleted is false when the
// user was already gone (idempotent — research G1).
func (c *Cognito) DeleteAdmin(ctx context.Context, username string) (deleted bool, err error) {
	if _, derr := c.api.AdminDeleteUser(ctx, &cip.AdminDeleteUserInput{
		UserPoolId: aws.String(c.poolID),
		Username:   aws.String(username),
	}); derr != nil {
		var nf *types.UserNotFoundException
		if errors.As(derr, &nf) {
			return false, nil
		}
		return false, fmt.Errorf("AdminDeleteUser: %w", derr)
	}
	return true, nil
}
