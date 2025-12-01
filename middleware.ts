import { NextResponse, type NextRequest } from "next/server";
import auth0 from "@/lib/auth/auth0";

const PUBLIC_PATH_PREFIXES = ["/auth/login", "/auth/logout", "/auth/callback", "/auth/profile"];

function isPublicRoute(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  if (process.env.AUTH0_MOCK_ENABLED === "true") {
    return NextResponse.next();
  }

  const authResponse = await auth0.middleware(request);
  const pathname = request.nextUrl.pathname;

  if (isPublicRoute(pathname)) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};

