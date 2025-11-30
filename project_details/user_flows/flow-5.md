### Flow 5: API Key Creation

**Trigger**: User creates API key for programmatic access

**Flow Diagram**:
```
User submits API key form (name, permissions, expires_at)
    ↓
Validate permissions array
    ↓
Generate API key (random string, 32 chars)
    ↓
Hash key (store hash, not plaintext)
    ↓
Insert into api_keys table
    ↓
Return plaintext key ONCE (show in UI, never again)
    ↓
User copies key
    ↓
[Subsequent requests use Bearer token with API key]
    ↓
Validate key hash on each request
    ↓
Check permissions match requested operation
    ↓
Check expiration
    ↓
Update last_used_at
```

**API Endpoints**:
- `POST /v1/api-keys` - Create API key
- `GET /v1/api-keys` - List user's API keys
- `DELETE /v1/api-keys/{keyId}` - Revoke API key

**Database Changes**:
- Insert into `api_keys` (tenant_id, key_hash, name, permissions, expires_at)

**Notifications**:
- **Email**: API key created notification (template: `api_key_created`) - security alert
- **Email**: API key revoked notification (template: `api_key_revoked`)

**Exceptions**:
- **Invalid permissions**: Return 400
- **Key expired**: Return 401 on API requests
- **Key revoked**: Return 401 on API requests
- **Insufficient permissions**: Return 403 on API requests

**Manual Intervention**: None

---
