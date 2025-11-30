### Flow 4: Password Reset

**Trigger**: User clicks "Forgot Password" (local auth users only)

**Flow Diagram**:
```
User submits email
    ↓
Validate email exists
    ↓
Check user.auth_provider:
    If auth_provider='idp':
        Return 400 Bad Request with error message:
        "Password reset is not available for SSO users. Please reset your password through your identity provider (IdP)."
        Do NOT proceed with reset flow
    ↓
If auth_provider='local':
        Generate reset token (expires in 1 hour)
        Store token hash in user record
        Send password reset email
        Return success (don't reveal if email exists)
        ↓
        [User clicks reset link]
        ↓
        Validate token & show reset form
        ↓
        User submits new password
        ↓
        Validate password strength
        ↓
        Hash new password
        ↓
        Update user.password_hash
        ↓
        Invalidate all existing sessions (security)
        ↓
        Send confirmation email
        ↓
        Redirect to login
```

**API Endpoints**:
- `POST /v1/auth/forgot-password` - Request reset (local auth only)
- `GET /v1/auth/reset-password?token={token}` - Validate token
- `POST /v1/auth/reset-password` - Set new password

**Database Changes**:
- Update `users` (password_reset_token_hash, password_reset_expires_at) - only for auth_provider='local'
- Update `users` (password_hash, password_reset_token_hash=null) on reset
- Delete all `sessions` for user (force re-login)

**Notifications**:
- **Email**: Password reset link (template: `password_reset`) - only for local auth users
- **Email**: Password reset confirmation (template: `password_reset_success`)

**Exceptions**:
- **User has auth_provider='idp'**: Return 400, error message directing user to reset via their IdP
- **Token expired**: Return 401, request new reset
- **Token already used**: Return 400
- **Weak password**: Return 400, enforce password policy

**Manual Intervention**: None

**Note**: This flow is explicitly restricted to local auth users (`auth_provider='local'`). SSO users must reset passwords through their IdP. Any messaging in this section must not imply that SSO users can reset passwords via WRK.

---
