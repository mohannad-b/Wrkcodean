import { NextRequest, NextResponse } from "next/server";
import auth0 from "@/lib/auth/auth0";

type Auth0Action = "login" | "logout" | "callback" | "profile";

async function dispatch(action: Auth0Action, request: NextRequest): Promise<NextResponse> {
  const client: any = (auth0 as any)?.authClient ?? (auth0 as any);

  // #region agent log
  fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "pre-fix",
      hypothesisId: "H2",
      location: "app/api/auth/[auth0]/route.ts:dispatch",
      message: "Selected auth0 client",
      data: {
        hasClient: !!client,
        hasHandleLogin: !!client?.handleLogin,
        hasHandleLogout: !!client?.handleLogout,
        hasHandleCallback: !!client?.handleCallback,
        hasHandleProfile: !!client?.handleProfile,
        keys: Object.keys(client ?? {}),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!client?.handleLogin || !client?.handleLogout || !client?.handleCallback || !client?.handleProfile) {
    return NextResponse.json({ error: "Auth0 client missing handlers" }, { status: 500 });
  }

  switch (action) {
    case "login":
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "pre-fix",
          hypothesisId: "H3",
          location: "app/api/auth/[auth0]/route.ts:dispatch",
          message: "Handling login",
          data: {
            hasStartInteractiveLogin: !!client?.startInteractiveLogin,
            returnTo: request.nextUrl.searchParams.get("returnTo") ?? "/dashboard",
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      try {
        return client.startInteractiveLogin({
          returnTo: request.nextUrl.searchParams.get("returnTo") ?? "/dashboard",
        });
      } catch (err: any) {
        // #region agent log
        fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "login-error",
            hypothesisId: "H7",
            location: "app/api/auth/[auth0]/route.ts:dispatch",
            message: "Login handler threw",
            data: {
              error: err?.message ?? "unknown",
              name: err?.name ?? "unknown",
              stack: err?.stack ? String(err.stack).slice(0, 500) : "n/a",
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        throw err;
      }
    case "logout":
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "app/api/auth/[auth0]/route.ts:dispatch",
          message: "Handling logout",
          data: { hasHandleLogout: !!client?.handleLogout },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return client.handleLogout(request);
    case "callback":
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "pre-fix",
          hypothesisId: "H5",
          location: "app/api/auth/[auth0]/route.ts:dispatch",
          message: "Handling callback",
          data: { hasHandleCallback: !!client?.handleCallback },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return client.handleCallback(request);
    case "profile":
      // #region agent log
      fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "pre-fix",
          hypothesisId: "H6",
          location: "app/api/auth/[auth0]/route.ts:dispatch",
          message: "Handling profile",
          data: { hasHandleProfile: !!client?.handleProfile },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
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
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "app/api/auth/[auth0]/route.ts:GET",
      message: "Dispatching auth0 action",
      data: {
        action,
        hasHandleLogin: typeof (auth0 as any)?.handleLogin,
        hasAuthClient: !!(auth0 as any)?.authClient,
        authClientKeys: Object.keys((auth0 as any)?.authClient ?? {}),
        directKeys: Object.keys(auth0 as any),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return dispatch(action, request);
}

export async function POST(request: NextRequest, context: { params: { auth0?: string | string[] } }) {
  return GET(request, context);
}

