import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { tasks, users } from "@/db/schema";
import { db } from "@/db";
import { ApiError, handleApiError, requireTenantSession } from "@/lib/api/context";
import { can } from "@/lib/auth/rbac";
import { writeKvSecret, loginWithOidc } from "@/lib/vault/client";
import auth0 from "@/lib/auth/auth0";

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 80);
}

type ConnectPayload = {
  taskId?: string;
  systemName?: string;
  connectedVia?: string;
  username?: string;
  password?: string;
  idToken?: string;
  code?: string;
  redirectUri?: string;
  codeVerifier?: string;
};

export async function POST(request: Request) {
  try {
    const session = await requireTenantSession();

    if (!can(session, "integrations:manage", { type: "workspace", tenantId: session.tenantId })) {
      throw new ApiError(403, "Forbidden");
    }

    const body = (await request.json()) as ConnectPayload;
    const taskId = body.taskId?.trim();
    const systemName = body.systemName?.trim();
    const connectedVia = body.connectedVia;
    const username = body.username?.trim();
    const password = body.password ?? "";
    const idToken = body.idToken?.trim();
    const code = body.code?.trim();
    const redirectUri = body.redirectUri?.trim();
    const codeVerifier = body.codeVerifier?.trim();

    const sessionTokens = await auth0.getSession();
    const sessionIdToken = sessionTokens?.idToken;

    if (!taskId) throw new ApiError(400, "taskId is required.");
    if (!systemName) throw new ApiError(400, "systemName is required.");
    if (connectedVia !== "sso" && connectedVia !== "credentials") {
      throw new ApiError(400, "connectedVia must be 'sso' or 'credentials'.");
    }
    if (connectedVia === "credentials" && (!username || !password)) {
      throw new ApiError(400, "username and password are required for credential-based connections.");
    }

    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, session.tenantId)));

    if (!task) {
      throw new ApiError(404, "Task not found.");
    }

    const [userRow] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    const connectedBy = userRow?.name?.trim() || userRow?.email || "You";
    const systemSlug = slugify(systemName);
    const dataPath = `tasks/${taskId}/systems/${systemSlug}`;

    const oidcRole = process.env.VAULT_OIDC_ROLE;
    if (!oidcRole) {
      throw new ApiError(500, "Vault OIDC role not configured (VAULT_OIDC_ROLE).");
    }

    const { clientToken } = await loginWithOidc({
      role: oidcRole,
      jwt: idToken ?? sessionIdToken ?? undefined,
      code,
      redirectUri,
      codeVerifier,
    });

    const { version } = await writeKvSecret({
      dataPath,
      data: {
        systemName,
        connectedVia,
        username: username ?? "",
        password: connectedVia === "credentials" ? password : undefined,
        connectedBy,
        taskId,
      },
      token: clientToken,
    });

    return NextResponse.json({
      vaultPath: dataPath,
      version,
      connectedBy,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

