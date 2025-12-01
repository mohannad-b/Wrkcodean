### Flow 4: Password Reset

**Trigger**: User clicks "Forgot Password" (local auth users only)

**Flow Diagram**:
```
User submits email
    ↓
Check rate limits (per IP and per email)
    If rate limit exceeded:
        Return 429 Too Many Requests
    ↓
Return generic success response immediately
    (Do NOT reveal whether email exists)
    ↓
[Backend processing - silent]
    Check if email exists in database
    ↓
    If email exists:
        Check user.auth_provider:
            If auth_provider='idp':
                Log internally (no token generation)
                Do NOT send email
                Do NOT generate token
            If auth_provider='local':
                Generate cryptographically secure reset token
                Hash token using bcrypt/argon2
                Store token hash in user record
                Set password_reset_token_used=false (for audit tracking)
                Set expiration (1 hour)
                Create audit log entry (action_type='request_password_reset')
                    tenant_id = users.last_active_tenant_id IF user has active membership in that tenant, ELSE NULL
                Send password reset email
    If email does not exist:
        Log internally (no token generation)
        Do NOT send email
        Do NOT generate token
    ↓
[User clicks reset link]
    ↓
GET /v1/auth/reset-password?token={token}
    Validate token (check hash and expiration)
    ↓
    If password_reset_token_hash is NULL:
        Return 401 Unauthorized with message: "Invalid or expired reset token. Please request a new password reset."
    If token hash doesn't match (hash comparison fails):
        Return 401 Unauthorized with message: "Invalid or expired reset token. Please request a new password reset."
    If token expired (password_reset_expires_at < now):
        Return 401 Unauthorized with message: "This reset link has expired. Please request a new password reset."
    ↓
    If token valid:
        Show reset form
    ↓
POST /v1/auth/reset-password
    User submits new password (with CSRF token or same-site cookie)
    ↓
    Validate token (check hash and expiration)
    If password_reset_token_hash is NULL:
        Return 401 Unauthorized with message: "Invalid or expired reset token. Please request a new password reset."
    If token hash doesn't match (hash comparison fails):
        Return 401 Unauthorized with message: "Invalid or expired reset token. Please request a new password reset."
    If token expired (password_reset_expires_at < now):
        Return 401 Unauthorized with message: "This reset link has expired. Please request a new password reset."
    ↓
    Validate CSRF protection
    If CSRF validation fails:
        Return 403 Forbidden
    ↓
    Validate password strength
    ↓
Hash new password
    ↓
Update user.password_hash
    ↓
Mark reset token as used and clear token data (single-use enforcement)
    Set password_reset_token_used=true
    Set password_reset_token_hash=null (clear hash - prevents reuse)
    Set password_reset_expires_at=null (clear expiry)
    ↓
Invalidate all existing sessions for user
    Delete all sessions for user (sessions contain refresh tokens)
    Force re-login on all devices
    ↓
Create audit log entry (action_type='reset_password')
    tenant_id = users.last_active_tenant_id IF user has active membership in that tenant, ELSE NULL
    ↓
Send confirmation email
    ↓
Redirect to login
```

**API Endpoints**:
- `POST /v1/auth/forgot-password` - Request reset (local auth only)
  - Rate limited: Per IP (e.g., 5 requests/hour) and per email (e.g., 3 requests/hour)
  - Always returns 200 OK with generic success message (never reveals if email exists)
  - Backend silently checks auth_provider before token generation
  - No token generated for SSO users (auth_provider='idp')
- `GET /v1/auth/reset-password?token={token}` - Validate token and show reset form
  - Validates token hash and expiration
  - **Token validation logic** (in order):
    - Check if password_reset_token_hash is NOT NULL (if NULL, token invalid)
    - Check if password_reset_token_hash matches provided token (hashed comparison)
    - Check if password_reset_expires_at > now() (not expired)
  - **Token validation errors** (all return 401):
    - Token hash is NULL: Return 401 Unauthorized, message: "Invalid or expired reset token. Please request a new password reset."
    - Token hash doesn't match: Return 401 Unauthorized, message: "Invalid or expired reset token. Please request a new password reset."
    - Token expired (password_reset_expires_at < now): Return 401 Unauthorized, message: "This reset link has expired. Please request a new password reset."
  - If token valid: Return reset form page
  - **Note**: After successful password reset, the hash is cleared, so any reuse attempt will be detected as "hash is NULL" (401)
- `POST /v1/auth/reset-password` - Set new password
  - **CSRF Protection Required**: Must include CSRF token in request or use same-site cookie
  - **Token validation** (same logic as GET endpoint, in order):
    - Check if password_reset_token_hash is NOT NULL (if NULL, token invalid)
    - Check if password_reset_token_hash matches provided token (hashed comparison)
    - Check if password_reset_expires_at > now() (not expired)
  - **Token validation errors** (all return 401):
    - Token hash is NULL: Return 401 Unauthorized, message: "Invalid or expired reset token. Please request a new password reset."
    - Token hash doesn't match: Return 401 Unauthorized, message: "Invalid or expired reset token. Please request a new password reset."
    - Token expired (password_reset_expires_at < now): Return 401 Unauthorized, message: "This reset link has expired. Please request a new password reset."
  - Validates CSRF after token validation
  - Validates password strength
  - On success: Updates password, sets password_reset_token_used=true (for audit), clears hash/expiry, invalidates sessions, creates audit log, sends confirmation email
  - **Note**: After successful password reset, the hash is cleared, so any reuse attempt will be detected as "hash is NULL" (401)

**Database Changes**:
- **Token Generation** (only for auth_provider='local'):
  - Generate cryptographically secure random token
  - Hash token using bcrypt/argon2 (NEVER store plaintext)
  - Update `users` (password_reset_token_hash, password_reset_expires_at, password_reset_token_used=false)
  - Token is single-use: hash is cleared after successful reset to prevent reuse
  - password_reset_token_used flag is for audit/logging purposes only (not used in validation)
- **Password Reset Completion**:
  - Update `users`:
    - Set password_hash to new hashed password
    - Set password_reset_token_used=true (for audit/logging purposes only)
    - Set password_reset_token_hash=null (clear the hash - prevents token reuse)
    - Set password_reset_expires_at=null (clear the expiry)
  - **Note**: After hash is cleared, any attempt to use the token will be treated as "invalid/missing" (401) since the token cannot be matched to the user record. The password_reset_token_used flag is set for audit purposes only and is NOT used in validation logic (cannot be checked once hash is cleared).
- **Session Invalidation**:
  - Delete all `sessions` for user (sessions contain refresh tokens, so this invalidates all refresh tokens)
  - Force re-login on all devices
- **Audit Logs**:
  - **On successful token generation** (when password reset is requested for auth_provider='local' user):
    - Insert into `audit_logs` (action_type='request_password_reset', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now())
    - **tenant_id rule**: Use `users.last_active_tenant_id` ONLY IF the user has an active membership in that tenant (verify membership exists and is active), otherwise set tenant_id = NULL
    - This ensures safe tenant isolation: never log to a tenant the user is not actively a member of
  - **On successful password reset** (when new password is set and user record is updated):
    - Insert into `audit_logs` (action_type='reset_password', resource_type='user', resource_id=user_id, user_id, tenant_id, created_at=now())
    - **tenant_id rule**: Use `users.last_active_tenant_id` ONLY IF the user has an active membership in that tenant (verify membership exists and is active), otherwise set tenant_id = NULL
    - This ensures safe tenant isolation: never log to a tenant the user is not actively a member of

**Notifications**:
- **Email**: Password reset link (template: `password_reset`) - only for local auth users
- **Email**: Password reset confirmation (template: `password_reset_success`)

**Exceptions**:
- **Rate limit exceeded**: Return 429 Too Many Requests (per IP or per email limit)
- **User has auth_provider='idp'**: 
  - Backend silently handles (no token generated, no email sent)
  - Frontend always receives generic success (never reveals SSO status)
- **Token invalid or missing**: 
  - Occurs when: password_reset_token_hash is NULL or doesn't match the provided token (hash comparison fails)
  - Return 401 Unauthorized
  - Message: "Invalid or expired reset token. Please request a new password reset."
  - Applies to both GET and POST /v1/auth/reset-password
  - **Note**: After successful password reset, the hash is cleared (set to NULL), so any subsequent attempt to use the token will be treated as invalid/missing (401)
- **Token expired**: 
  - Occurs when: password_reset_expires_at < current timestamp
  - Return 401 Unauthorized
  - Message: "This reset link has expired. Please request a new password reset."
  - Applies to both GET and POST /v1/auth/reset-password
- **CSRF validation failed**: Return 403 Forbidden (on POST /v1/auth/reset-password only, after token validation)
- **Weak password**: Return 400 Bad Request, enforce password policy (on POST /v1/auth/reset-password only)

**Manual Intervention**: None

**Security Notes**:
- **Email Existence Privacy**: API always returns generic success response before checking auth_provider or email existence. No information leakage about whether email exists or user's auth provider.
- **Rate Limiting**: Enforced per IP and per email to prevent abuse and email enumeration attacks.
- **Token Security**: 
  - Tokens are always hashed (bcrypt/argon2) before storage - NEVER stored in plaintext
  - Tokens are single-use only - once used, cannot be reused
  - Token usage is tracked via password_reset_token_used boolean flag (for audit/logging purposes only):
    - Set to false on token generation
    - Set to true on successful password reset (for audit tracking)
    - Hash and expiry are cleared after successful reset to prevent reuse
  - **Validation**: Token validation only checks hash existence/match and expiration. The password_reset_token_used flag is NOT checked during validation (cannot be checked once hash is cleared).
  - After successful reset, any attempt to use the token is treated as invalid/missing (401) since the hash is cleared
  - Tokens expire after 1 hour
- **Auth Provider Enforcement**: No token is generated at all for SSO users (auth_provider='idp'), even internally. Check happens before any token generation.
- **Session Invalidation**: All sessions (which contain refresh tokens) are deleted on password reset, forcing re-login on all devices.
- **CSRF Protection**: POST /v1/auth/reset-password requires CSRF token or same-site cookie protection.
- **Audit Log Safety**: 
  - tenant_id in password-reset audit logs uses `users.last_active_tenant_id` ONLY IF the user has an active membership in that tenant (membership must be verified as existing and active)
  - If user has no active membership in `last_active_tenant_id`, or if `last_active_tenant_id` is NULL, then tenant_id = NULL
  - This rule ensures safe tenant isolation: audit logs are never written to a tenant the user is not actively a member of

**Note**: This flow is explicitly restricted to local auth users (`auth_provider='local'`). SSO users must reset passwords through their IdP. Any messaging in this section must not imply that SSO users can reset passwords via WRK.

---
