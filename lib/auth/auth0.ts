import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Lazy-initialized Auth0 SDK client. Skips initialization when mock auth is
// enabled so that workers and scripts that transitively import this module
// don't crash on an invalid / placeholder Auth0 domain URL.
let _auth0: Auth0Client | null = null;

function getAuth0(): Auth0Client {
  if (_auth0) return _auth0;

  const secret = process.env.AUTH0_SECRET ?? "";
  const isProd = process.env.NODE_ENV === "production";
  const cookieOptions = {
    sameSite: "lax" as const,
    secure: isProd,
    path: "/",
  };

  _auth0 = new Auth0Client({
    domain: process.env.AUTH0_DOMAIN ?? "",
    clientId: process.env.AUTH0_CLIENT_ID ?? "",
    clientSecret: process.env.AUTH0_CLIENT_SECRET ?? "",
    secret,
    appBaseUrl: process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "",
    authorizationParameters: {
      scope: "openid profile email",
    },
    routes: {
      login: "/api/auth/login",
      logout: "/api/auth/logout",
      callback: "/api/auth/callback",
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

  return _auth0;
}

export const auth0 = new Proxy({} as Auth0Client, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuth0(), prop, receiver);
  },
});

export default auth0;

