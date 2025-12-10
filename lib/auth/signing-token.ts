import crypto from "crypto";

const ALGO = "sha256";

function getSecret(): string {
  const secret = process.env.SIGNING_TOKEN_SECRET;
  if (!secret) {
    throw new Error("SIGNING_TOKEN_SECRET is not configured");
  }
  return secret;
}

export type SigningTokenPayload = {
  tenantId: string;
  quoteId: string;
  issuedAt: number;
  expiresAt: number;
};

export function createSigningToken(payload: SigningTokenPayload): string {
  const secret = getSecret();
  const raw = `${payload.tenantId}.${payload.quoteId}.${payload.issuedAt}.${payload.expiresAt}`;
  const hmac = crypto.createHmac(ALGO, secret).update(raw).digest("hex");
  return Buffer.from(`${raw}.${hmac}`).toString("base64url");
}

export function verifySigningToken(token: string): SigningTokenPayload | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(".");
    if (parts.length !== 5) return null;
    const [tenantId, quoteId, issuedAtStr, expiresAtStr, signature] = parts;
    const issuedAt = Number(issuedAtStr);
    const expiresAt = Number(expiresAtStr);
    if (!tenantId || !quoteId || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
    if (Date.now() > expiresAt) return null;
    const secret = getSecret();
    const raw = `${tenantId}.${quoteId}.${issuedAt}.${expiresAt}`;
    const expected = crypto.createHmac(ALGO, secret).update(raw).digest("hex");
    if (expected !== signature) return null;
    return { tenantId, quoteId, issuedAt, expiresAt };
  } catch {
    return null;
  }
}

