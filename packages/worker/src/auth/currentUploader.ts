import type { Env } from "../env.js";
import { findActiveUploaderById, type Uploader } from "../services/uploaders.js";
import { parseCookies } from "./cookies.js";
import { SESSION_COOKIE, verifySession } from "./session.js";

/** The signed-in, still-active uploader for this request, or null. */
export async function currentUploader(
  request: Request,
  env: Env,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<Uploader | null> {
  if (!env.SESSION_SECRET) return null;
  const token = parseCookies(request.headers.get("cookie"))[SESSION_COOKIE];
  if (!token) return null;
  const session = await verifySession(token, env.SESSION_SECRET, nowSec);
  if (!session) return null;
  return findActiveUploaderById(env.DB, session.uploaderId);
}
