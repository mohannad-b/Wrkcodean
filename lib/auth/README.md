## Session guards

- **Tenant session** (`getTenantSession` / `requireTenantSession`): tenant/workspace context is required and the session includes `tenantId`, membership `roles`, and optional `wrkStaffRole`. Use for tenant-scoped APIs and pages.
- **Staff session** (`getWrkStaffSession` / `requireWrkStaffSession`): Wrk employees only. No tenant membership required. Returns `kind: "staff"` plus `userId`, `email`, `name`, and `wrkStaffRole`.
- **Either session** (`requireEitherTenantOrStaffSession`): for endpoints that support both client members and Wrk staff (e.g., workflow chat). Returns `{ kind: "tenant" | "staff", ... }`—do not synthesize a tenantId for staff.
- **User session** (`requireUserSession`): authenticated user only, no tenant requirement (useful for profile/TOS updates).

Examples:
- Wrk-only endpoints like `app/api/wrk/inbox` should use `requireWrkStaffSession`.
- Dual-access endpoints like workflow chat routes should use `requireEitherTenantOrStaffSession` and branch on `session.kind`.
- Tenant-scoped CRUD and billing endpoints should continue using `requireTenantSession`.

