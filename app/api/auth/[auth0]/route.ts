import { NextRequest, NextResponse } from "next/server";
import auth0 from "@/lib/auth/auth0";
import { sendDevAgentLog } from "@/lib/dev/agent-log";

export const runtime = "nodejs";

const AUTH0_LOG_OPTIONS = {
  throttleMs: 2000,
  sampleRate: 0.1,
};

function logAuth0(payload: Record<string, unknown>, request: NextRequest, action: string) {
  const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/dashboard";
  sendDevAgentLog(
    {
      ...payload,
      returnTo,
    },
    {
      ...AUTH0_LOG_OPTIONS,
      dedupeKey: `${action}|${request.nextUrl.pathname}|${returnTo}`,
    }
  );
}

type Auth0Action = "login" | "logout" | "callback" | "profile";

async function dispatch(action: Auth0Action, request: NextRequest): Promise<NextResponse> {
  const client: any = (auth0 as any)?.authClient ?? (auth0 as any);

  logAuth0(
    {
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
        keyCount: Object.keys(client ?? {}).length,
      },
    },
    request,
    action
  );

  if (!client?.handleLogin || !client?.handleLogout || !client?.handleCallback || !client?.handleProfile) {
    return NextResponse.json({ error: "Auth0 client missing handlers" }, { status: 500 });
  }

  switch (action) {
    case "login":
      logAuth0(
        {
          sessionId: "debug-session",
          runId: "pre-fix",
          hypothesisId: "H3",
          location: "app/api/auth/[auth0]/route.ts:dispatch",
          message: "Handling login",
          data: {
            hasStartInteractiveLogin: !!client?.startInteractiveLogin,
          },
        },
        request,
        action
      );
      try {
        return client.startInteractiveLogin({
          returnTo: request.nextUrl.searchParams.get("returnTo") ?? "/dashboard",
        });
      } catch (err: any) {
        logAuth0(
          {
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
          },
          request,
          action
        );
        throw err;
      }
    case "logout":
      logAuth0(
        {
          sessionId: "debug-session",
          runId: "pre-fix",
          hypothesisId: "H4",
          location: "app/api/auth/[auth0]/route.ts:dispatch",
          message: "Handling logout",
          data: { hasHandleLogout: !!client?.handleLogout },
        },
        request,
        action
      );
      return client.handleLogout(request);
    case "callback":
      logAuth0(
        {
          sessionId: "debug-session",
          runId: "pre-fix",
          hypothesisId: "H5",
          location: "app/api/auth/[auth0]/route.ts:dispatch",
          message: "Handling callback",
          data: { hasHandleCallback: !!client?.handleCallback },
        },
        request,
        action
      );
      return client.handleCallback(request);
    case "profile":
      logAuth0(
        {
          sessionId: "debug-session",
          runId: "pre-fix",
          hypothesisId: "H6",
          location: "app/api/auth/[auth0]/route.ts:dispatch",
          message: "Handling profile",
          data: { hasHandleProfile: !!client?.handleProfile },
        },
        request,
        action
      );
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

  logAuth0(
    {
      sessionId: "debug-session",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: "app/api/auth/[auth0]/route.ts:GET",
      message: "Dispatching auth0 action",
      data: {
        action,
        hasHandleLogin: typeof (auth0 as any)?.handleLogin === "function",
        hasAuthClient: !!(auth0 as any)?.authClient,
        authClientKeyCount: Object.keys((auth0 as any)?.authClient ?? {}).length,
        directKeyCount: Object.keys(auth0 as any).length,
      },
    },
    request,
    action
  );

  return dispatch(action, request);
}

export async function POST(request: NextRequest, context: { params: { auth0?: string | string[] } }) {
  return GET(request, context);
}

