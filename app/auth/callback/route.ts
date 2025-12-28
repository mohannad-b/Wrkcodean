import { NextRequest, NextResponse } from "next/server";

// Forwards Auth0 callback traffic to the SDK handler.
export function GET(request: NextRequest) {
  const callbackUrl = new URL("/api/auth/callback", request.nextUrl.origin);
  request.nextUrl.searchParams.forEach((value, key) => {
    callbackUrl.searchParams.set(key, value);
  });
  return NextResponse.redirect(callbackUrl);
}

