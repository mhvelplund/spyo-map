import type { OAuthProvider } from "./providers.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

/**
 * Verifies a Google ID token (from the mobile app's native sign-in) with Google's tokeninfo endpoint.
 * Returns the verified email, or null if the token is invalid, for another audience, unverified or expired.
 */
export async function verifyIdToken(
  idToken: string,
  clientId: string,
  fetchFn: typeof fetch,
  nowSec: number,
): Promise<string | null> {
  const res = await fetchFn(`${TOKENINFO_URL}?${new URLSearchParams({ id_token: idToken }).toString()}`);
  if (!res.ok) return null;
  const info = (await res.json()) as Record<string, unknown>;
  const verified = info.email_verified === true || info.email_verified === "true";
  if (
    info.aud !== clientId ||
    typeof info.iss !== "string" ||
    !ISSUERS.has(info.iss) ||
    !verified ||
    !(Number(info.exp) > nowSec) ||
    typeof info.email !== "string" ||
    !info.email
  ) {
    return null;
  }
  return info.email;
}

export const google: OAuthProvider = {
  id: "google",

  authorizeUrl({ clientId, redirectUri, state, codeChallenge }) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    return `${AUTH_URL}?${params.toString()}`;
  },

  async exchangeForVerifiedEmail({ code, codeVerifier, redirectUri, clientId, clientSecret }, fetchFn) {
    const tokenRes = await fetchFn(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!tokenRes.ok) return null;
    const { access_token: accessToken } = (await tokenRes.json()) as { access_token?: unknown };
    if (typeof accessToken !== "string" || !accessToken) return null;

    const infoRes = await fetchFn(USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!infoRes.ok) return null;
    const info = (await infoRes.json()) as { email?: unknown; email_verified?: unknown };
    if (info.email_verified !== true || typeof info.email !== "string" || !info.email) return null;
    return info.email;
  },
};
