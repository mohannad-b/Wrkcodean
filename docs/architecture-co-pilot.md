# WRK CoPilot Architecture Guardrails

This doc captures the non-negotiable constraints for the current codebase. Every change should map cleanly to these principles before it ships.

## Domain & Ownership
- `automations` are the intent; `automation_versions` are the deployable unit and the only record allowed to own `blueprint_json`.
- `blueprint_json` follows the canonical sections + steps schema (see Types below) and always lives on the active `automation_version`.
- `projects` and `quotes` model the commercial lifecycle for a version. Projects mirror version delivery status, while quotes capture pricing (`setup_fee`, `unit_price`, `estimated_volume`) plus overrides and signature state.
- `clients` are the ops/commercial lens for a `tenant`. Every DB access path starts with the tenant, never ad-hoc joins without tenant predicates.

## State Machines
- **Automation / Automation Version**
  - Allowed statuses: `IntakeInProgress → NeedsPricing → AwaitingClientApproval → BuildInProgress → QATesting → Live → Archived`.
  - Transitions must respect `lib/automations/status.ts` (and `lib/build-status/types.ts`) so we never jump backward unless explicitly allowed (e.g., archive from `Live` only).
  - Moving into `NeedsPricing` guarantees a tenant-scoped `project` record exists and is synced afterwards.
- **Quotes**
  - Statuses: `DRAFT → SENT → SIGNED` with the single fallback of `REJECTED`.
  - Only forward transitions defined in `lib/quotes/status.ts` are valid; no multi-hop shortcuts in APIs or UI.

## Access & Auth
- Use `requireTenantSession()` (Auth0-backed) in every server route. Never read `tenantId` from user input.
- All DB queries must include `WHERE table.tenant_id = session.tenantId`.
- RBAC decisions go through `lib/auth/rbac` and actions that mutate pricing/status/blueprints must emit `logAudit(...)`.

## API Shape
- Route handlers follow the same structure:
  1. `const session = await requireTenantSession();`
  2. Authorize with `can(session, ...)`.
  3. Execute tenant-scoped Drizzle queries/services.
  4. Wrap responses in `NextResponse.json(...)`.
  5. Catch errors via `handleApiError` (only `ApiError` sets custom status).
- Shared helpers own context (`lib/api/context.ts`), business operations (`lib/services/*`), and audit logging (`lib/audit/log.ts`). No inline session lookups or bespoke error JSON per route.

## UI Rules
- Each surface has one canonical route:
  - Studio: `/automations`, `/automations/[id]`, `/dashboard`, etc.
  - Admin: `/admin/clients`, `/admin/projects`, `/admin/projects/[id]`.
  - Delete duplicate or legacy versions (e.g., mock `/(admin)` mirrors) so links, breadcrumbs, and tests target a single path.
- The Studio Blueprint tab is a fixed layout: Copilot chat + red-chip sections + canvas + step drawer. No “phase” abstractions or alternate editors.
- Blueprint editing/rendering always consumes the shared helpers (`createEmptyBlueprint`, `BlueprintEditorPanel`, `BlueprintSummary`) and never reimplements step/section shapes inline.
- Mock data stays at the top of the component (or in `/lib/mock-*`) and is clearly marked with `// TODO` plus the eventual data source.

## Types as Source of Truth
- `lib/blueprint/types.ts` defines `Blueprint`, `BlueprintSection`, and `BlueprintStep`. `lib/blueprint/schema.ts` is the only Zod schema that validates them. Remove duplicate interfaces elsewhere.
- API route payloads and UI props must reference these exported types directly (`Blueprint`, `BlueprintStep`, `BlueprintSectionKey`). Do not cast to `any` or redefine slices of the schema.
- `db/schema.ts` remains the authoritative mapping for tenant-scoped tables. Any derived helpers (e.g., `services/automations.ts`) should return domain-specific types composed from those exports instead of anonymous objects.

Keep this checklist close—if a change cannot be justified against these principles, we either refactor it or update the architecture doc first.

