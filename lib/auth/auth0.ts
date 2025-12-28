import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Central Auth0 SDK client instance. Configuration is primarily driven by env vars:
// AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, APP_BASE_URL.
const secret = process.env.AUTH0_SECRET ?? "";
const isProd = process.env.NODE_ENV === "production";
const cookieOptions = {
  sameSite: "lax" as const,
  secure: isProd,
  path: "/",
};

export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN ?? "",
  clientId: process.env.AUTH0_CLIENT_ID ?? "",
  clientSecret: process.env.AUTH0_CLIENT_SECRET ?? "",
  secret,
  appBaseUrl: process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000",
  authorizationParameters: {
    scope: "openid profile email",
  },
  routes: {
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    callback: "/api/auth/callback",
    profile: "/api/auth/profile",
    accessToken: "/api/auth/access-token",
    backChannelLogout: "/api/auth/backchannel-logout",
    connectAccount: "/api/auth/connect",
  },
  session: {
    rolling: true,
    absoluteDuration: 60 * 60 * 24 * 7, // 7 days
    inactivityDuration: 60 * 60 * 6, // 6 hours of inactivity
    cookie: cookieOptions,
  },
});

export default auth0;

