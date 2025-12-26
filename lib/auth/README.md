## Session guards

- **Tenant session** (`getTenantSession` / `requireTenantSession`): tenant/workspace context is required and the session includes `tenantId`, membership `roles`, and optional `wrkStaffRole`. Use for tenant-scoped APIs and pages.
- **Staff session** (`getWrkStaffSession` / `requireWrkStaffSession`): Wrk employees only. No tenant membership required. Returns `kind: "staff"` plus `userId`, `email`, `name`, and `wrkStaffRole`.
- **Either session** (`requireEitherTenantOrStaffSession`): for endpoints that support both client members and Wrk staff (e.g., workflow chat). Returns `{ kind: "tenant" | "staff", ... }`—do not synthesize a tenantId for staff.
- **User session** (`requireUserSession`): authenticated user only, no tenant requirement (useful for profile/TOS updates).

## Authorization entrypoints

- Use `authorize(action, context, session)` in server handlers; it throws `AuthorizationError` with a consistent status/code.
- Use `can(session, action, context)` for UI/conditional checks.
- Actions are grouped into tenant actions (e.g., `automation:update`, `workflow:chat:write`) and platform actions (e.g., `platform:workspace:read`, `platform:chat:write`, `platform:impersonate`).
- Staff roles map to platform actions; selected tenant actions (like workflow chat) are allowed for staff via platform mappings. Tenant roles map to tenant actions and always require a matching `tenantId` in the context.

Examples:
- Wrk-only endpoints like `app/api/wrk/inbox` should call `authorize("platform:chat:read", { type: "platform" }, session)`.
- Dual-access endpoints like workflow chat routes call `authorize("workflow:chat:read", { type: "workflow", tenantId, workflowId }, session)`; staff are allowed via platform chat permissions.
- Tenant-scoped CRUD and billing endpoints should continue using `authorize`/`can` with `{ tenantId, type: ... }` contexts.

