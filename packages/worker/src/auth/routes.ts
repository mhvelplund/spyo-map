import type { Env } from "../env.js";
import { findActiveUploaderByEmail } from "../services/uploaders.js";
import { parseCookies, serializeCookie } from "./cookies.js";
import { google } from "./google.js";
import { codeChallengeS256, constantTimeEqual, randomToken } from "./pkce.js";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "./session.js";

const OAUTH_COOKIE = "spyo_oauth";
const OAUTH_COOKIE_PATH = "/auth";
const OAUTH_TTL_SECONDS = 600;

const UPLOAD_PAGE = "/#/upload";
const UPLOAD_ERROR = "/#/upload?error=1";
const UPLOAD_DENIED = "/#/upload?denied=1";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", c);
  return new Response(null, { status: 302, headers });
}

const clearOAuthCookie = (): string =>
  serializeCookie(OAUTH_COOKIE, "", { maxAge: 0, path: OAUTH_COOKIE_PATH, httpOnly: true });

/** True only when the request carries an `Origin` header equal to its own origin. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

function isConfigured(env: Env): boolean {
  return Boolean(env.SESSION_SECRET && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

const redirectUriFor = (request: Request): string =>
  `${new URL(request.url).origin}/auth/callback/google`;

async function login(request: Request, env: Env): Promise<Response> {
  if (!isConfigured(env)) return json({ error: "Sign-in is not configured" }, 500);

  const state = randomToken();
  const verifier = randomToken();
  const location = google.authorizeUrl({
    clientId: env.GOOGLE_CLIENT_ID,
    redirectUri: redirectUriFor(request),
    state,
    codeChallenge: await codeChallengeS256(verifier),
  });
  // HttpOnly and scoped to /auth; carries only state and verifier, never identity.
  const cookie = serializeCookie(OAUTH_COOKIE, `${state}.${verifier}`, {
    maxAge: OAUTH_TTL_SECONDS,
    path: OAUTH_COOKIE_PATH,
    httpOnly: true,
  });
  return redirect(location, [cookie]);
}

async function callback(request: Request, env: Env, fetchFn: typeof fetch): Promise<Response> {
  const clear = clearOAuthCookie();
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";

  const stored = parseCookies(request.headers.get("cookie"))[OAUTH_COOKIE] ?? "";
  const [storedState = "", verifier = "", ...rest] = stored.split(".");
  if (
    !state ||
    !code ||
    !storedState ||
    !verifier ||
    rest.length > 0 ||
    !constantTimeEqual(state, storedState) ||
    !isConfigured(env)
  ) {
    return redirect(UPLOAD_ERROR, [clear]);
  }

  let email: string | null;
  try {
    email = await google.exchangeForVerifiedEmail(
      {
        code,
        codeVerifier: verifier,
        redirectUri: redirectUriFor(request),
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      fetchFn,
    );
  } catch {
    return redirect(UPLOAD_ERROR, [clear]);
  }
  if (!email) return redirect(UPLOAD_DENIED, [clear]);

  const uploader = await findActiveUploaderByEmail(env.DB, email);
  if (!uploader) return redirect(UPLOAD_DENIED, [clear]);

  const token = await signSession(
    { uploaderId: uploader.id, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS },
    env.SESSION_SECRET,
  );
  const session = serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    httpOnly: true,
  });
  return redirect(UPLOAD_PAGE, [clear, session]);
}

function logout(request: Request): Response {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const headers = new Headers({ "cache-control": "no-store" });
  headers.append("set-cookie", serializeCookie(SESSION_COOKIE, "", { maxAge: 0, path: "/", httpOnly: true }));
  return new Response(null, { status: 204, headers });
}

export async function handleAuthRequest(
  request: Request,
  env: Env,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = request.method;

  if (pathname === "/auth/login/google") {
    return method === "GET" ? login(request, env) : json({ error: "Method not allowed" }, 405);
  }
  if (pathname === "/auth/callback/google") {
    return method === "GET"
      ? callback(request, env, fetchFn)
      : json({ error: "Method not allowed" }, 405);
  }
  if (pathname === "/auth/logout") {
    return method === "POST" ? logout(request) : json({ error: "Method not allowed" }, 405);
  }
  return json({ error: "Not found" }, 404);
}
