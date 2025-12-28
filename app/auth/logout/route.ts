import { NextRequest, NextResponse } from "next/server";

// Redirects to the Auth0 SDK logout handler while preserving returnTo.
export function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo");
  const logoutUrl = new URL("/api/auth/logout", request.nextUrl.origin);
  if (returnTo) {
    logoutUrl.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.redirect(logoutUrl);
}

