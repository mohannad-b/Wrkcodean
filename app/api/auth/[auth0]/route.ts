import { NextRequest, NextResponse } from "next/server";
import auth0 from "@/lib/auth/auth0";

type Auth0Action = "login" | "logout" | "callback" | "profile";

async function dispatch(action: Auth0Action, request: NextRequest): Promise<NextResponse> {
  const client: any = (auth0 as any)?.handleLogin ? auth0 : (auth0 as any)?.authClient;

  if (!client?.handleLogin || !client?.handleLogout || !client?.handleCallback || !client?.handleProfile) {
    return NextResponse.json({ error: "Auth0 client missing handlers" }, { status: 500 });
  }

  switch (action) {
    case "login":
      return client.startInteractiveLogin({
        returnTo: request.nextUrl.searchParams.get("returnTo") ?? "/dashboard",
      });
    case "logout":
      return client.handleLogout(request);
    case "callback":
      return client.handleCallback(request);
    case "profile":
      return client.handleProfile(request);
    default:
      return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

function getAction(param: string | string[] | undefined): Auth0Action | null {
  const value = Array.isArray(param) ? param[0] : param;
  if (value === "login" || value === "logout" || value === "callback" || value === "profile") {
    return value;
  }
  return null;
}

export async function GET(request: NextRequest, { params }: { params: { auth0?: string | string[] } }) {
  const action = getAction(params.auth0);
  if (!action) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "handle-check",
      hypothesisId: "E",
      location: "app/api/auth/[auth0]/route.ts:GET",
      message: "Dispatching auth0 action",
      data: { action, hasHandleLogin: typeof auth0.handleLogin },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return dispatch(action, request);
}

export async function POST(request: NextRequest, context: { params: { auth0?: string | string[] } }) {
  return GET(request, context);
}

