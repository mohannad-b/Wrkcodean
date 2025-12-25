# Email Service (Transactional, Notifications, Marketing)

## Purpose
Centralized EmailService for all outbound email types (transactional/system, notifications, marketing) with provider abstraction, queueing, idempotency, logging, preferences, and webhook handling. Uses Figma-exported HTML as canonical templates with minimal interpolation.

## Architecture
- **Module**: `lib/email/` (pure server-side).
- **API surface**: `EmailService.sendTransactional`, `sendNotification`, `sendMarketing`, `enqueueSend`, `renderTemplate`, `validate`.
- **Pipeline**: validate inputs → persist `EmailMessage` → enqueue → worker dequeues → choose provider (round-robin) → send → `EmailEvent` logging → webhook updates status/suppression.
- **Queue**: Redis + BullMQ (simplest ops). Backoff retries for transient errors; DLQ via BullMQ failed queue. Can swap via queue adapter later.
- **Providers**: Postmark (primary) + Amazon SES (secondary) behind `EmailProvider` interface. Round-robin per send across configured providers; stop on permanent errors.
- **Templates**: Versioned HTML in repo under `lib/email/templates/`; metadata in `registry.ts` (subject, required variables Zod schema, sender, category, sample vars). HTML is canonical; only interpolation + safe link insertion allowed. Plaintext fallback generated.
- **Preferences**: `EmailPreference` (marketing opt-out, notifications opt-out, optional per-category flags). Transactional bypasses marketing opt-out; global “all email off” policy optional.
- **Compliance**: List-Unsubscribe for marketing; physical address/footer placeholder; SPF/DKIM/DMARC documented per sender domain; suppression on bounce/complaint.
- **Observability**: `EmailMessage` + `EmailEvent` tables; structured logs with provider info; webhook ingestion for delivered/open/click/bounce/complaint/suppression; admin query helper.

## Modules/Files to add
- `lib/email/types.ts` – enums, payload types, template metadata types.
- `lib/email/render.ts` – template render/validation (interpolation, plaintext fallback, variable escaping).
- `lib/email/templates/registry.ts` – registry of templates (templateId → metadata, Zod schema, sample vars, file path).
- `lib/email/provider/index.ts` – provider interface, round-robin selection, factory from env.
- `lib/email/provider/postmark.ts` – Postmark implementation (server token, message send).
- `lib/email/provider/ses.ts` – Amazon SES implementation (region/keys; simple send, no attachments v1).
- `lib/email/service.ts` – orchestration, preference checks, idempotency hook, enqueue/send helpers.
- `lib/email/queue/bullmq.ts` – BullMQ queue wiring (Redis URL, backoff, DLQ).
- `lib/email/preferences.ts` – helpers for opt-out logic per category.
- `app/api/email/webhook/route.ts` – provider webhook handler (signed).
- `scripts/email-preview.ts` – CLI preview: render template with sample vars and print HTML/text.

## Data Models (Drizzle)
- **Enums**: `email_category` (`transactional`, `notification`, `marketing`); `email_status` (`queued`, `sent`, `delivered`, `opened`, `clicked`, `bounced`, `complaint`, `suppressed`, `failed`); `email_event_type` (same as statuses).
- **EmailMessage**: `id (uuid)`, `tenantId?`, `userId?`, `category`, `templateId`, `to`, `from`, `subject`, `variablesJson`, `idempotencyKey` (unique), `provider`, `providerMessageId?`, `status`, `campaignId?`, `attachmentsJson?`, timestamps.
- **EmailEvent**: `id`, `emailMessageId` FK, `type`, `providerPayload`, timestamps.
- **EmailPreference**: `id`, `userId?`, `email`, `marketingOptOut bool`, `notificationsOptOut bool`, `categoryPrefsJson?`, timestamps (unique on `userId` or `email`).
- **EmailSuppression** (if provider not authoritative): `id`, `email`, `reason`, `provider`, timestamps, unique on (`email`, `provider`).
- **Indexes**: `EmailMessage(idempotencyKey) unique`; `EmailMessage(category, status)`; `EmailEvent(emailMessageId, type)`; `EmailSuppression(email)`.

## Config / Env
- `EMAIL_PROVIDERS=postmark,ses` (or `ses` only)
- `POSTMARK_SERVER_TOKEN`
- `AWS_SES_REGION`
- `AWS_SES_ACCESS_KEY_ID`
- `AWS_SES_SECRET_ACCESS_KEY`
- `AWS_SES_CONFIGURATION_SET` (optional)
- `REDIS_URL`, optional `EMAIL_QUEUE_PREFIX`
- `EMAIL_DEFAULT_FROM`, `EMAIL_SUPPORT_FROM`, `EMAIL_NOTIFICATIONS_FROM`, `EMAIL_NEWS_FROM`
- `EMAIL_WEBHOOK_SECRET` (HMAC)
- `APP_BASE_URL` (links/unsubscribe)
- `EMAIL_PHYSICAL_ADDRESS` (marketing footer)
- Optional: `EMAIL_PREVIEW_PASSWORD` (protect dev preview route)

## Queue & Retry
- BullMQ queue `email:send` with exponential backoff (e.g., 3–5 attempts, base 30s). Permanent errors (invalid address, suppression, policy) → no retry; log + mark failed.
- DLQ: BullMQ failed queue inspected by ops; can be replayed manually.
- Idempotency: require `idempotencyKey`; upsert on enqueue; duplicates return existing message id.

## Provider Failover (round-robin)
- Providers loaded from `EMAIL_PROVIDERS` in order.
- Each job carries `providerIndex`; on transient error advance to next provider; on success record providerMessageId; on permanent error stop.
- Metrics/logging include provider and failover path.

## Preferences & Policies
- Transactional/system: always send unless explicit global “all email off” policy is set.
- Notifications: respect global notifications opt-out (and category flags if present).
- Marketing: require marketing opt-in (default opt-out) and suppression check; always include unsubscribe header + link + physical address.

## Webhooks
- Single route `/api/email/webhook` (provider-specific parsing) with signature verification.
- Maps providerMessageId → EmailMessage, appends EmailEvent, updates status; writes suppression on bounce/complaint.

## Developer Ergonomics
- Add template HTML file under `lib/email/templates/<category>/<templateId>.html`.
- Register in `registry.ts` with subject, required vars (Zod), sender, category, sample vars.
- Run `wnpm run email:preview <templateId>` to verify rendering.
- Call `EmailService.send*` with typed payload; TypeScript infers variables from registry.

## Minimal Tests
- Unit: template validation (missing/extra vars), render escapes variables and builds plaintext; preference checks block/allow per category; idempotency guard returns existing on duplicate key.
- Integration (provider mocked): enqueue + worker sets EmailMessage to `sent`; webhook updates to `bounced` and writes suppression; marketing send blocked on opt-out but transactional allowed.
- CLI: preview command renders without throwing for all registered templates.

## Next Steps to Implement
1) Add Drizzle enums/tables + migration.  
2) Add `lib/email/*` scaffolding (types, registry, render, provider stubs, service, queue).  
3) Add webhook route and preview script.  
4) Wire EmailService into first use cases (workspace invite, task assigned, marketing test).  
5) Add tests and env samples.

