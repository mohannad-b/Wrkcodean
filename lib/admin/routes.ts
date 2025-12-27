const WRK_ADMIN_BASE = "/wrk-admin";
const LEGACY_ADMIN_BASE = "/admin";

export const wrkAdminRoutes = {
  home: WRK_ADMIN_BASE,
  submissions: `${WRK_ADMIN_BASE}/submissions`,
  submissionDetail: (submissionId: string) => `${WRK_ADMIN_BASE}/submissions/${submissionId}`,
  workspaces: `${WRK_ADMIN_BASE}/workspaces`,
  workspaceDetail: (workspaceId: string) => `${WRK_ADMIN_BASE}/workspaces/${workspaceId}`,
  inbox: `${WRK_ADMIN_BASE}/inbox`,
  staff: `${WRK_ADMIN_BASE}/staff`,
};

export const legacyAdminRoutes = {
  home: LEGACY_ADMIN_BASE,
  submissions: `${LEGACY_ADMIN_BASE}/submissions`,
  submissionDetail: (submissionId: string) => `${LEGACY_ADMIN_BASE}/submissions/${submissionId}`,
  projects: `${LEGACY_ADMIN_BASE}/projects`,
  projectDetail: (projectId: string) => `${LEGACY_ADMIN_BASE}/projects/${projectId}`,
  clients: `${LEGACY_ADMIN_BASE}/clients`,
  clientDetail: (clientId: string) => `${LEGACY_ADMIN_BASE}/clients/${clientId}`,
};

