---

```md
<!-- OBSERVABILITY_SLOS_INCIDENTS.md -->
# WRK Copilot Observability, SLOs & Incident Management

## 1. Goals

- Detect issues **before** clients report them.
- Make debugging multi-tenant problems fast and predictable.
- Provide clear **SLOs** and a basic **incident playbook**.

---

## 2. Observability Stack

### 2.1 Logging

- **Structured JSON logs** from:
  - API (edge + core app)
  - Workers (build, AI ingestion, notifications, usage aggregation)
  - Webhook handlers
- Every log event should include:
  - `timestamp`
  - `level` (`DEBUG`, `INFO`, `WARN`, `ERROR`)
  - `request_id` (correlated from edge → core → workers)
  - `tenant_id` (where applicable)
  - `user_id` (for user-driven actions)
  - `route` / `job_type`
  - `resource_type` / `resource_id` (if relevant)

Sensitive data (payloads, secrets, credentials) must **never** be logged.

### 2.2 Metrics

Metrics are split by domain:

#### API Layer

- `http_request_count{route, method, status}`
- `http_request_duration_seconds_bucket{route, method}`
- `http_4xx_count{route}`
- `http_5xx_count{route}`

#### Workers

- `worker_job_count{queue, status}`
- `worker_job_duration_seconds{queue}`
- `worker_dead_letter_count{queue}`

#### Database

- `db_query_duration_seconds{operation, table}`
- `db_connection_pool_in_use`
- `db_lock_wait_time_seconds`

#### Domain-Level

- `automation_versions_by_status{status}`
- `projects_by_status{status}`
- `run_events_ingested_total`
- `usage_aggregates_updated_total`
- `quotes_by_status{status}`
- `client_health_status{status}`

### 2.3 Traces

Minimum tracing:

- API request → DB calls → worker enqueue.
- Webhook → DB → worker (usage aggregation).

Use `request_id` / `trace_id` threading across services.

---

## 3. SLOs (Service Level Objectives)

### 3.1 API SLOs

- **Studio API** (`/v1/automations`, `/v1/automation-versions/*`):
  - Availability: 99.5% monthly.
  - Latency: p95 < 400ms for read endpoints, p95 < 800ms for write endpoints.

- **Admin API** (`/v1/admin/*`):
  - Availability: 99.0% monthly.
  - Latency: p95 < 600ms reads, p95 < 1,000ms writes.

### 3.2 Webhooks & Workers

- **Run Event Webhook**:
  - Availability: 99.5%.
  - Latency: 95% of events processed (stored in `run_events`) within 30s of reception.
- **Usage Aggregation Worker**:
  - Aggregates updated within 5 minutes of underlying run event.

### 3.3 Build & Status Updates

- **Build Orchestration**:
  - 95% of build jobs processed within 5 minutes of enqueue (assuming WRK Platform availability).
- **Notifications**:
  - 95% of notification jobs processed within 60 seconds.

---

## 4. Dashboards

At minimum, define dashboards:

### 4.1 API Health Dashboard

- Request rate, 4xx, 5xx by route.
- Latency by route (p50, p95, p99).
- Error heatmap (by tenant, route).

### 4.2 Worker & Queue Dashboard

- Queue depth per queue (`build-requests`, `ai-ingestion`, `notifications`, `usage-aggregation`).
- Job failure rate.
- Dead-letter queue size.

### 4.3 WRK Platform Integration Dashboard

- Success/failure rates of WRK Platform API calls.
- Latency of key calls: workflow creation, deactivation.
- Webhook failure rates (invalid signatures, timeouts).

### 4.4 Domain Dashboards

- **Automations**:
  - Count by status.
  - Trend of new automations per week.
- **Quotes**:
  - Count by status (`draft`, `sent`, `signed`, `rejected`).
- **Client Health**:
  - Clients by `health_status`.
  - New `At Risk` / `Churn Risk` per week.

---

## 5. Alerting

### 5.1 Generic Infra Alerts

- API 5xx rate > 1% for 5 minutes.
- P95 latency > 2 seconds for 5 minutes.
- Queue depth > 1000 for 10 minutes.
- DB connection pool > 90% utilization for 5 minutes.

### 5.2 Domain Alerts

- No `run_events` ingested for N minutes while WRK Platform is expected to be online (per-tenant or global).
- Failure rate for WRK Platform API > 5% for 10 minutes.
- `client_health_status` changed to `Churn Risk` for top-tier client (ops escalation).

### 5.3 Security Alerts

- Multiple 401/403s from same IP over short period (brute force).
- Webhook signature verification failures > threshold.

---

## 6. Incident Management

### 6.1 Severity Levels

- **SEV-1**: Platform-wide outage, key flows broken (e.g. login, viewing automations, WRK Platform integration).
- **SEV-2**: Major feature impacted for subset of tenants (e.g. webhooks failing for some tenants).
- **SEV-3**: Degraded performance, minor bugs, or partial failures.

### 6.2 Standard Playbook

For SEV-1 / SEV-2:

1. **Detection**  
   Alert fires → on-call acknowledges.

2. **Triage**
   - Identify blast radius: which tenants/routes/features?
   - Check dashboards: API, workers, WRK platform integration.

3. **Mitigation**
   - Feature flag off problematic functionality.
   - Apply traffic shaping / rate limiting if needed.
   - Roll back recent deployment if strongly correlated.

4. **Communication**
   - Internal: status channel updates every 15–30 minutes.
   - External: status page update for bigger incidents, targeted emails for critical tenants.

5. **Resolution & Recovery**
   - Confirm metrics back to baseline.
   - Clear backlog of queues if needed.

6. **Postmortem**
   - SEV-1 and major SEV-2 require a written postmortem within 72 hours:
     - What happened, why, impact, remediation, follow-ups.

---

## 7. Implementation Notes

- Wrap logging/metrics/tracing in a small **`observability` module** so you can switch providers without touching business logic.
- Standardize **error codes** (e.g. `archive_remote_deactivation_failed`, `credential_scope_mismatch`) so you can group by them in logs.
- Add **request IDs** at the edge and pass them through workers via queue payloads.