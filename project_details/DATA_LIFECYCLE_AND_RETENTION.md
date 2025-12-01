<!-- DATA_LIFECYCLE_AND_RETENTION.md -->
# WRK Copilot Data Lifecycle & Retention

## 1. Goals

- Define how long different data types live.
- Control storage growth and keep DB/Neon happy.
- Make tenant export/deletion predictable.
- Avoid surprises around PII and audit data.

---

## 2. Data Categories

### 2.1 Configuration & Domain Data

- `tenants`, `users`, `automations`, `automation_versions`
- `workflow_bindings`
- `quotes`, `pricing_overrides`
- `projects`, `clients`
- `tasks` (non-log-like)
- `messages`

These are **core** entities; generally long-lived.

### 2.2 Log-Like / High-Volume Data

- `run_events`
- `usage_aggregates`
- `audit_logs`
- Notification logs (if stored)

These grow fast and need retention / aggregation strategies.

### 2.3 AI-Related Data

- User-provided docs (URLs stored in DB, content in object storage).
- `blueprint_json` and optional:
  - `requirements_json`
  - `ai_annotations` / `ai_suggestions`

### 2.4 Credentials & Secrets

- Actual secrets live in external secrets manager (not in DB).
- DB only stores:
  - references / IDs,
  - metadata (e.g. “Salesforce OAuth credential”).

---

## 3. Retention Policies (Initial v1)

> These are starting points; make them configurable later if enterprises demand it.

### 3.1 Configuration Data

- `tenants`, `users`, `automations`, `automation_versions`, `workflow_bindings`, `quotes`, `projects`, `clients`, `tasks`, `messages`:
  - **Retention**: Indefinite by default.
  - **Deletion**:
    - Hard-delete only when:
      - Tenant deletion requested, **and**
      - Legal/accounting allows it.
    - Otherwise: soft-delete (e.g. `deleted_at` column) for users, automations, etc.

### 3.2 Run Events & Usage Aggregates

- `run_events`:
  - Retain fine-grained events for **6–12 months** (configurable).
  - After that, delete or move to cold storage (object storage / archive DB).
- `usage_aggregates`:
  - Retain for **24+ months** (billing and analytics).
  - Optional: older than N years can be further aggregated (e.g. monthly).

A nightly job should:

- Find `run_events` older than retention threshold.
- Ensure usage has been aggregated + billing period finalized.
- Delete or archive.

### 3.3 Audit Logs

- `audit_logs`:
  - Retain for **at least 2–3 years**; could be longer for compliance.
  - Never update; only append.
  - Tenant deletion: either:
    - Keep logs but pseudonymize user IDs, or
    - Delete tenant-scoped logs if required by contract.

### 3.4 AI Artifacts

- Uploaded documents / recordings:
  - Stored in object storage, referenced from DB.
  - Retain as long as the automation/version is active.
  - When an automation is `Archived`, you can:
    - keep inputs for future versions, or
    - mark them for cleanup after X months.

- AI intermediate structures (`requirements_json`, `ai_suggestions`):
  - Low volume; can be kept as long as `automation_version` exists.
  - Hard delete when the version is hard-deleted.

---

## 4. Tenant Export & Deletion

### 4.1 Tenant Export

Provide an admin-only operation (internal to start):

- Exports:
  - `tenants`, `users` (within tenant),
  - `automations`, `automation_versions` (with blueprint JSON),
  - `workflow_bindings` metadata (no secrets),
  - `projects`, `clients`, `quotes`,
  - `messages`, `tasks`,
  - Aggregated usage (not raw run_events by default).
- Format:
  - JSON or NDJSON for relational data.
  - Signed URLs for any attached docs.

### 4.2 Tenant Deletion

**Two phases**:

1. **Soft Lock (Deactivation)**:
   - Mark tenant as `status='deactivated'`.
   - Block login and all mutations.
   - Keep data intact for a cool-down period (e.g. 30 days).

2. **Hard Cleanup**:
   - Remove:
     - `automations`, `automation_versions`, `projects`, `clients`, `messages`, `tasks`, `workflow_bindings`, `run_events`, `usage_aggregates`, etc.
   - Decide what happens to:
     - `audit_logs` → either deleted or pseudonymized depending on policy.
     - `billing` / invoices → typically retained for legal reasons.

Tenant deletion MUST be performed by internal `admin`/`ops_admin` with explicit confirmation and audit log entry.

---

## 5. Index & Partition Strategy

To keep Neon healthy over time:

### 5.1 Partition Candidates

- `run_events`: partition by month or quarter on `started_at`.
- `usage_aggregates`: partition by month on `period_start`.
- `audit_logs`: partition by month/year on `created_at`.

Partitioning makes:
- Pruning old data cheap (`DROP PARTITION`).
- Long-range queries more predictable.

### 5.2 Index Maintenance

- Regularly monitor:
  - Index bloat.
  - Slow queries (especially on `run_events`, `audit_logs`).
- Avoid unbounded indexes on free text columns; rely on `tenant_id` + time columns.

---

## 6. Backups & Restore

### 6.1 Backups

- Neon provides snapshots; configure:
  - Daily full backup.
  - WAL for point-in-time recovery (if available).
- Document:
  - Backup schedule.
  - Retention of backups themselves (e.g. 30–90 days).

### 6.2 Restore Procedures

- At least quarterly:
  - Perform a **test restore** into a staging DB.
  - Verify:
    - Tenants can be loaded.
    - Automations/blueprints are intact.
    - No missing tables/indexes.

---

## 7. PII & Sensitive Data

- PII primarily in:
  - `users.email`, `users.name`.
  - Some `messages.text` (free text).
- Sensitive-but-not-secret:
  - `clients.committed_monthly_spend`.
- Secrets:
  - Must **not** be stored in DB:
    - No API keys, OAuth tokens, passwords.
  - Only references to secrets manager IDs.

When building features, treat any field that might contain customer identifiers as PII and avoid logging it.

---

## 8. Operational Jobs

Define a small set of scheduled jobs:

- `prune_run_events`:
  - Delete / archive old `run_events`.
- `prune_usage_aggregates` (optional):
  - Archive aggregates older than X years.
- `prune_soft_deleted`:
  - Actually delete rows marked `deleted_at` after some grace period.
- `verify_object_storage_references`:
  - Check for dangling references or missing blobs.

Each job should log:
- Number of rows scanned/deleted.
- Tenant distribution (if relevant).
- Errors encountered.