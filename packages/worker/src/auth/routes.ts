import type { IdTokenSignInRequest, MeResponse } from "@spyo-map/shared";
import type { Env } from "../env.js";
import { findActiveUploaderByEmail } from "../services/uploaders.js";
import { parseCookies, serializeCookie } from "./cookies.js";
import { google, verifyIdToken } from "./google.js";
import { codeChallengeS256, constantTimeEqual, randomToken } from "./pkce.js";
import {
  isUsableSessionSecret,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
} from "./session.js";

const OAUTH_COOKIE = "spyo_oauth";
const OAUTH_COOKIE_PATH = "/auth";
const OAUTH_TTL_SECONDS = 600;

type ReturnTo = "upload" | "map";

// Fixed strings only: the redirect location is never built from user input.
const REDIRECTS: Record<ReturnTo, { ok: string; denied: string; error: string }> = {
  upload: { ok: "/#/upload", denied: "/#/upload?denied=1", error: "/#/upload?error=1" },
  map: { ok: "/#/map", denied: "/#/map?signin=denied", error: "/#/map?signin=error" },
};

/** Exactly "map" selects the map; anything else (including junk) is the upload page. */
function parseReturnTo(v: string | null): ReturnTo {
  return v === "map" ? "map" : "upload";
}

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
  return Boolean(
    isUsableSessionSecret(env.SESSION_SECRET) && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
  );
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
  // HttpOnly and scoped to /auth; carries only state, verifier and return target, never identity.
  const returnTo = parseReturnTo(new URL(request.url).searchParams.get("return"));
  const cookie = serializeCookie(OAUTH_COOKIE, `${state}.${verifier}.${returnTo}`, {
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
  const [storedState = "", verifier = "", returnSeg, ...rest] = stored.split(".");
  // A missing return segment is the legacy 2-segment cookie, which meant the upload page.
  const returnValid = returnSeg === undefined || returnSeg === "upload" || returnSeg === "map";
  // A malformed cookie (extra segments or unknown target) is unparseable, so errors use upload's URL.
  const target = REDIRECTS[returnValid && rest.length === 0 ? parseReturnTo(returnSeg ?? null) : "upload"];
  if (
    !returnValid ||
    !state ||
    !code ||
    !storedState ||
    !verifier ||
    rest.length > 0 ||
    !constantTimeEqual(state, storedState) ||
    !isConfigured(env)
  ) {
    return redirect(target.error, [clear]);
  }

  // Any throw from Google, D1 or signing lands on the error redirect and still clears spyo_oauth.
  let token: string;
  try {
    const email = await google.exchangeForVerifiedEmail(
      {
        code,
        codeVerifier: verifier,
        redirectUri: redirectUriFor(request),
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
      fetchFn,
    );
    if (!email) return redirect(target.denied, [clear]);

    const uploader = await findActiveUploaderByEmail(env.DB, email);
    if (!uploader) return redirect(target.denied, [clear]);

    token = await signSession(
      { uploaderId: uploader.id, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS },
      env.SESSION_SECRET,
    );
  } catch {
    return redirect(target.error, [clear]);
  }
  const session = serializeCookie(SESSION_COOKIE, token, {
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    httpOnly: true,
  });
  return redirect(target.ok, [clear, session]);
}

/** The mobile app's native Google sign-in: trades a Google ID token for the same session cookie as callback(). */
async function idTokenSignIn(request: Request, env: Env, fetchFn: typeof fetch): Promise<Response> {
  if (!isSameOrigin(request)) return json({ error: "Forbidden" }, 403);
  if (!isConfigured(env)) return json({ error: "Sign-in is not configured" }, 500);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const idToken = (body as Partial<IdTokenSignInRequest> | null)?.idToken;
  if (typeof idToken !== "string" || !idToken) return json({ error: "Bad request" }, 400);

  const nowSec = Math.floor(Date.now() / 1000);
  let email: string | null;
  try {
    email = await verifyIdToken(idToken, env.GOOGLE_CLIENT_ID, fetchFn, nowSec);
  } catch {
    email = null;
  }
  if (!email) return json({ error: "Invalid token" }, 401);

  let token: string;
  let me: MeResponse;
  try {
    const uploader = await findActiveUploaderByEmail(env.DB, email);
    if (!uploader) return json({ error: "Not allowed" }, 403);
    me = { displayName: uploader.displayName, isAdmin: uploader.isAdmin };
    token = await signSession({ uploaderId: uploader.id, exp: nowSec + SESSION_TTL_SECONDS }, env.SESSION_SECRET);
  } catch {
    return json({ error: "Sign-in failed" }, 500);
  }
  const res = json(me, 200);
  res.headers.append(
    "set-cookie",
    serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_SECONDS, path: "/", httpOnly: true }),
  );
  return res;
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
  if (pathname === "/auth/google/idtoken") {
    return method === "POST"
      ? idTokenSignIn(request, env, fetchFn)
      : json({ error: "Method not allowed" }, 405);
  }
  if (pathname === "/auth/logout") {
    return method === "POST" ? logout(request) : json({ error: "Method not allowed" }, 405);
  }
  return json({ error: "Not found" }, 404);
}
