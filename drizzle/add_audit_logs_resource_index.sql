CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
  ON audit_logs (tenant_id, resource_type, resource_id, created_at DESC);


