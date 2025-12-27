import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATH_PREFIXES = [
  "/",
  "/assets",
  "/wrk-logo.svg",
  "/blueprints",
  "/contact",
  "/ops-teams",
  "/pricing",
  "/privacy",
  "/product",
  "/resources",
  "/terms",
  "/trust",
  "/use-cases",
  "/auth/login",
  "/auth/logout",
  "/auth/callback",
  "/auth/profile",
];

function isPublicRoute(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  if (process.env.AUTH0_MOCK_ENABLED === "true") {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next();
  const hasSession = Boolean(request.cookies.get("appSession")?.value);

  // Clear active workspace cookie on logout
  if (pathname.startsWith("/auth/logout")) {
    response.cookies.set("activeWorkspaceId", "", { path: "/", maxAge: 0 });
    return response;
  }

  // If a workspaceId is provided in the query, persist it as active.
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (workspaceId) {
    response.cookies.set("activeWorkspaceId", workspaceId, { path: "/", httpOnly: false, sameSite: "lax" });
  }

  if (isPublicRoute(pathname)) {
    if (hasSession && pathname === "/") {
      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
    return response;
  }

  if (!hasSession) {
    if (pathname.startsWith("/api")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const loginUrl = new URL("/auth/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("returnTo", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|assets|wrk-logo.svg).*)",
  ],
};

