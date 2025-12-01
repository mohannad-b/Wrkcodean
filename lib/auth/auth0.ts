import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Central Auth0 SDK client instance. Configuration is primarily driven by env vars:
// AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_SECRET, APP_BASE_URL.
export const auth0 = new Auth0Client({
  // Ensure we have a base URL even in preview/local environments.
  appBaseUrl: process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000",
  authorizationParameters: {
    scope: "openid profile email",
  },
  session: {
    rolling: true,
    absoluteDuration: 60 * 60 * 24 * 7, // 7 days
    inactivityDuration: 60 * 60 * 6, // 6 hours of inactivity
  },
});

export default auth0;

