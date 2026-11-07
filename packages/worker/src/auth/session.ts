import { base64urlDecode, base64urlEncode } from "./pkce.js";

export interface SessionPayload {
  uploaderId: number;
  /** Expiry, epoch seconds. */
  exp: number;
}

export const SESSION_COOKIE = "spyo_session";
export const SESSION_TTL_SECONDS = 604800;
/** Shorter (or missing) secrets are treated as "not configured": never sign or verify with them. */
export const MIN_SESSION_SECRET_LENGTH = 32;

export function isUsableSessionSecret(secret: string | undefined | null): secret is string {
  return typeof secret === "string" && secret.length >= MIN_SESSION_SECRET_LENGTH;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Returns `base64url(JSON).base64url(HMAC-SHA256)`. Throws on a missing or too-short secret. */
export async function signSession(p: SessionPayload, secret: string): Promise<string> {
  if (!isUsableSessionSecret(secret)) throw new Error("Session secret is not configured");
  const body = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ uploaderId: p.uploaderId, exp: p.exp })),
  );
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${base64urlEncode(new Uint8Array(sig))}`;
}

/**
 * Returns the payload, or null on a bad signature, malformed token, missing or too-short secret,
 * or `exp <= nowSec`.
 */
export async function verifySession(
  token: string,
  secret: string,
  nowSec: number,
): Promise<SessionPayload | null> {
  if (!isUsableSessionSecret(secret)) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sigText] = parts;
  if (!body || !sigText) return null;
  const sig = base64urlDecode(sigText);
  if (!sig) return null;

  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    sig,
    new TextEncoder().encode(body),
  );
  if (!ok) return null;

  const raw = base64urlDecode(body);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { uploaderId, exp } = parsed as Record<string, unknown>;
  if (typeof uploaderId !== "number" || !Number.isSafeInteger(uploaderId) || uploaderId <= 0) {
    return null;
  }
  if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= nowSec) return null;
  return { uploaderId, exp };
}
