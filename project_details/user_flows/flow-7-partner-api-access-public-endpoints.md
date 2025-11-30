### Flow 7 (Optional / Future): Partner API Access (Public Endpoints)

**Note**: This flow is out of scope for v1 and is kept here as a future-phase concept. The core WRK Copilot product does not depend on it.

**Trigger**: Partner uses API key to call `/v1/public/*` endpoints

**Flow Diagram**:
```
Partner obtains API key (Flow 5)
    ↓
Partner sends request:
    Authorization: Bearer <api_key>
    GET /v1/public/automations
    ↓
Edge / API Gateway:
    Validates key hash
    Resolves tenant_id + permissions from api_keys table
    Applies rate limiting (per tenant, per API key)
    ↓
Backend receives request:
    Extract tenant_id from API key context (not from request)
    Filter all queries by tenant_id
    Check permissions match requested operation
    ↓
Execute operation (read-only for public endpoints)
    ↓
Create audit log entry (for access tracking)
    ↓
Return response (tenant-scoped data only)
```

**API Endpoints**:
- `GET /v1/public/automations` - List automations (read-only, filtered by API key's tenant)
- `GET /v1/public/automation-versions/{id}/runs` - Get run history
- All `/v1/public/*` endpoints require API key authentication

**Database Changes**: 
- Insert into `audit_logs` (action_type='api_access', resource_type='api_key', resource_id=api_key_id, user_id=null, tenant_id, created_at=now(), metadata_json={'endpoint': endpoint_path, 'method': http_method}) - log API access for security/audit purposes

**Notifications**: None

**Exceptions**:
- **Invalid API key**: Return 401 Unauthorized
- **Key expired**: Return 401
- **Key revoked**: Return 401
- **Insufficient permissions**: Return 403 Forbidden
- **Rate limit exceeded**: Return 429 Too Many Requests

**Manual Intervention**: None

**Security Note**: "Public" means "for programmatic/partner use", not anonymous access. All `/v1/public/*` endpoints require valid API key authentication. Rate limiting is enforced per tenant and per API key.

