/**
 * Minimal HS256 JWT sign/verify using Node crypto (no external deps).
 * Enough for session tokens; swap for a vetted library if requirements grow.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TokenPayload {
  sub: string; // user id
  role: string;
  email: string;
  name?: string;
  iat?: number;
  exp?: number;
}

const DEFAULT_TTL = 60 * 60 * 24 * 7; // 7 days

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export function signToken(
  payload: TokenPayload,
  secret: string,
  ttlSeconds = DEFAULT_TTL,
): string {
  const now = Math.floor(Date.now() / 1000);
  const body: TokenPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify(body));
  const data = `${header}.${claims}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export class TokenError extends Error {}

export function verifyToken(token: string, secret: string): TokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new TokenError("Malformed token");
  const [header, claims, sig] = parts as [string, string, string];
  const data = `${header}.${claims}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new TokenError("Bad signature");
  }
  let body: TokenPayload;
  try {
    body = JSON.parse(Buffer.from(claims, "base64url").toString());
  } catch {
    throw new TokenError("Bad payload");
  }
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) {
    throw new TokenError("Token expired");
  }
  return body;
}
