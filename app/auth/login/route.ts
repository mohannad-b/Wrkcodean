import { NextRequest, NextResponse } from "next/server";

// Redirects to the Auth0 SDK login handler while preserving returnTo.
export function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get("returnTo");
  const loginUrl = new URL("/api/auth/login", request.nextUrl.origin);
  if (returnTo) {
    loginUrl.searchParams.set("returnTo", returnTo);
  }
  return NextResponse.redirect(loginUrl);
}

