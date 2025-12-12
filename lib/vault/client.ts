import { ApiError } from "@/lib/api/context";

type OidcLoginParams = {
  role: string;
  // One of: id_token, access_token, or an auth code with redirect_uri/code_verifier if you wire PKCE.
  jwt?: string;
  redirectUri?: string;
  code?: string;
  codeVerifier?: string;
};

type VaultConfig = {
  addr: string;
  namespace?: string;
  kvMount: string;
};

function getVaultConfig(): VaultConfig {
  const addr = process.env.VAULT_ADDR;
  const kvMount = process.env.VAULT_KV_MOUNT ?? "secret";
  const namespace = process.env.VAULT_NAMESPACE;

  if (!addr) {
    throw new ApiError(500, "Vault address is not configured (VAULT_ADDR).");
  }

  return { addr: addr.replace(/\/+$/, ""), kvMount, namespace };
}

async function vaultRequest<T>(path: string, init: RequestInit, token: string): Promise<T> {
  const { addr, namespace } = getVaultConfig();
  const url = `${addr}/v1/${path.replace(/^\/+/, "")}`;

  const headers = new Headers(init.headers ?? {});
  headers.set("Content-Type", "application/json");
  headers.set("X-Vault-Token", token);
  if (namespace) {
    headers.set("X-Vault-Namespace", namespace);
  }

  const res = await fetch(url, {
    ...init,
    headers,
  });

  if (!res.ok) {
    let message = `Vault request failed with status ${res.status}`;
    try {
      const body = (await res.json()) as any;
      if (body?.errors?.length) {
        message = body.errors.join("; ");
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(500, message);
  }

  return (await res.json()) as T;
}

export async function loginWithOidc(params: OidcLoginParams): Promise<{ clientToken: string }> {
  const { addr, namespace } = getVaultConfig();

  if (!params.role) {
    throw new ApiError(500, "Vault OIDC role not provided.");
  }

  const url = `${addr}/v1/auth/oidc/login`;
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (namespace) headers.set("X-Vault-Namespace", namespace);

  const body: Record<string, unknown> = { role: params.role };
  if (params.jwt) body.jwt = params.jwt;
  if (params.code) {
    body.code = params.code;
    if (params.redirectUri) body.redirect_uri = params.redirectUri;
    if (params.codeVerifier) body.code_verifier = params.codeVerifier;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = `Vault OIDC login failed with status ${res.status}`;
    try {
      const j = (await res.json()) as any;
      if (j?.errors?.length) message = j.errors.join("; ");
    } catch {
      // ignore
    }
    throw new ApiError(500, message);
  }

  const data = (await res.json()) as any;
  const clientToken = data?.auth?.client_token;
  if (!clientToken) {
    throw new ApiError(500, "Vault OIDC login did not return a client token.");
  }
  return { clientToken };
}

export async function writeKvSecret<T extends Record<string, unknown>>(params: {
  dataPath: string;
  data: T;
  token: string;
}): Promise<{ version: number }> {
  const { kvMount } = getVaultConfig();
  const token = params.token;
  const cleanedPath = params.dataPath.replace(/^\/+/, "");
  const body = JSON.stringify({ data: params.data });

  const result = await vaultRequest<{ data?: { version?: number } }>(
    `${kvMount}/data/${cleanedPath}`,
    {
      method: "POST",
      body,
    },
    token
  );

  return { version: result.data?.version ?? 0 };
}

export async function readKvSecret(params: { dataPath: string; token: string }) {
  const { kvMount } = getVaultConfig();
  const token = params.token;
  const cleanedPath = params.dataPath.replace(/^\/+/, "");

  return vaultRequest<{ data?: { data?: Record<string, unknown>; metadata?: { version?: number } } }>(
    `${kvMount}/data/${cleanedPath}`,
    {
      method: "GET",
    },
    token
  );
}

