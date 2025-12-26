import { NextResponse, type NextRequest } from "next/server";
import auth0 from "@/lib/auth/auth0";

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

  const authResponse = await auth0.middleware(request);
  const pathname = request.nextUrl.pathname;

  // If a workspaceId is provided in the query, persist it as active.
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (workspaceId) {
    authResponse.cookies.set("activeWorkspaceId", workspaceId, { path: "/", httpOnly: false, sameSite: "lax" });
  }

  if (isPublicRoute(pathname)) {
    const session = await auth0.getSession(request);
    if (session && pathname === "/") {
      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
    return authResponse;
  }

  const session = await auth0.getSession(request);

  if (!session) {
    if (pathname.startsWith("/api")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const loginUrl = new URL("/auth/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("returnTo", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  return authResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|assets|wrk-logo.svg).*)",
  ],
};

